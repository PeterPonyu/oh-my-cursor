- **OWASP Class:** `A01:2021 - Broken Access Control` (specifically IDOR / BOLA).
- **Severity:** **High**.
- **Vulnerable Line(s):** `3-4` (`Order.query.get(oid)` + unconditional `return`).

**Attack scenario (concrete request):**  
An authenticated user (or even unauthenticated, if route is public) can enumerate order IDs and read other users' orders:

`GET /orders/1001`  
`GET /orders/1002`  
`GET /orders/1003`

Because the handler fetches by direct object ID and returns it without checking ownership/authorization, any valid `oid` is exposed.

**Smallest remediation:**  
Add an authorization check tied to the current user before returning the object.

```python
@app.get('/orders/<int:oid>')
@login_required
def get_order(oid):
    o = Order.query.get_or_404(oid)
    if o.user_id != current_user.id:
        abort(404)  # or 403
    return jsonify(o.to_dict())
```

Using `404` for unauthorized access can reduce object-enumeration signal.