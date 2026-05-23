- **OWASP class:** `A03:2021 – Injection` (SQL Injection)  
- **Severity:** `High`  
- **Attack scenario:** An attacker supplies a crafted `name` like `"' OR '1'='1"` (or DB-specific payloads such as `'; DROP TABLE users; --`) so the concatenated SQL changes meaning, bypasses intended filtering, and can expose or modify data.  
- **file:line:** `snippet.py:2` (dynamic SQL string concatenation)  
- **Remediation:** Use parameterized queries/prepared statements, never string concatenation for SQL. Also apply least-privileged DB credentials and (optionally) input allowlisting for expected username format.

```python
def get_user(name):
    q = "SELECT * FROM users WHERE name = ?"
    return db.execute(q, (name,)).fetchone()
```

(Placeholder style may vary by driver, e.g. `%s`, `:name`, `$1`.)