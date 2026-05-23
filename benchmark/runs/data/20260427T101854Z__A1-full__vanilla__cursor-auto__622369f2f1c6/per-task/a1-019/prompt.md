## User prompt

Security-review this snippet. Output the OWASP class, severity, attack scenario, file:line, and remediation.

```python
1 def get_user(name):
2     q = "SELECT * FROM users WHERE name = '" + name + "'"
3     return db.execute(q).fetchone()
```
