- **OWASP class:** `A03:2021 – Injection` (SQL Injection)  
  **Severity:** `High`  
  **Attack scenario:** An attacker supplies `name` like `' OR '1'='1` (or DB-specific payloads such as `'; DROP TABLE users; --` where allowed), causing the query to return unauthorized data or alter/delete data because user input is concatenated directly into SQL.  
  **file:line:** `snippet.py:2` (the query construction line in the provided snippet)  
  **Remediation:** Use parameterized queries/prepared statements; never build SQL with string concatenation. Also enforce least-privilege DB credentials and validate input format/length.

```python
def get_user(name):
    q = "SELECT * FROM users WHERE name = ?"
    return db.execute(q, (name,)).fetchone()
```

- **OWASP class:** `A01:2021 – Broken Access Control` (potential secondary impact)  
  **Severity:** `Medium`  
  **Attack scenario:** If this function is used in an authenticated flow, SQL injection can bypass intended record-level restrictions and return other users’ rows, effectively breaking access boundaries.  
  **file:line:** `snippet.py:2-3`  
  **Remediation:** In addition to fixing injection, enforce authorization checks at the service layer so returned user data is constrained to what the caller is allowed to access.