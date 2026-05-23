## User prompt

Security-review. Identify OWASP class, severity, attack scenario with concrete request, line, and the smallest remediation.

```python
1 @app.get('/orders/<int:oid>')
2 def get_order(oid):
3     o = Order.query.get(oid)
4     return jsonify(o.to_dict())
```
