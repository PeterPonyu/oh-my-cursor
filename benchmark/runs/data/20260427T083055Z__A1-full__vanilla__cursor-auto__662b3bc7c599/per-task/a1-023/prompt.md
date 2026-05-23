## User prompt

Security-review this code. OWASP class, severity, attack scenario, line, remediation.

```python
1 import pickle
2 def load_session(blob):
3     return pickle.loads(blob)
```
