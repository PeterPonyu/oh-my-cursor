- **OWASP class:** `A03:2021 – Injection` (SQL Injection / CWE-89)  
- **Severity:** **High**  
- **Attack scenario:** An attacker supplies input like `' OR '1'='1' --` for `name`, causing the query to become valid attacker-controlled SQL, potentially bypassing intended filtering, dumping user rows, or modifying data (depending on DB permissions).  
- **File:line:** `snippet.py:2` (string concatenation into SQL), with sink at `snippet.py:3` (`db.execute(q)`)  
- **Remediation:** Use parameterized queries/prepared statements; never concatenate untrusted input into SQL. Also enforce least-privilege DB accounts and optionally validate input format.

```python
def get_user(name):
    q = "SELECT * FROM users WHERE name = ?"
    return db.execute(q, (name,)).fetchone()
```

If your DB driver uses `%s` or named params (`:name`) instead of `?`, use that driver’s parameter syntax.