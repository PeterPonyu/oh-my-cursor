## User prompt

Review this Python snippet for bugs. Output severity-rated findings with line references and the smallest fix.

```python
 1 def load_users(path):
 2     f = open(path)
 3     data = json.load(f)
 4     users = [User(**row) for row in data if row['active']]
 5     return users
```
