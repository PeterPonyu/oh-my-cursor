- **High** — File handle leak due to missing close on all paths (`line 2`): if `json.load` or list construction raises, `f.close()` is never called.  
  **Smallest fix:** use a context manager.
- **Medium** — Possible `KeyError` when a row lacks `active` (`line 4`): `row['active']` crashes on missing key.  
  **Smallest fix:** use `row.get('active')`.

Minimal patch:

```python
def load_users(path):
    with open(path) as f:
        data = json.load(f)
    users = [User(**row) for row in data if row.get('active')]
    return users
```

If you want this to be stricter (e.g., reject rows missing `active`), I can provide a validated version too.