## User prompt

Security-review this snippet. Output OWASP class, severity, attack scenario, line cited, and remediation.

```python
1 import hashlib
2 def store_password(user, pw):
3     h = hashlib.md5(pw.encode()).hexdigest()
4     db.execute('UPDATE users SET pw_hash=? WHERE id=?', (h, user.id))
```
