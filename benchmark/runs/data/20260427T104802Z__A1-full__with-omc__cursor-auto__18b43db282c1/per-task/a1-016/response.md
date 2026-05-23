- **High** — File handle leak on success/failure (`line 2`): `open(path)` is never closed, so repeated calls can exhaust file descriptors.  
  **Smallest fix:** use a context manager.
- **Medium** — Possible `KeyError` when filtering (`line 4`): `row['active']` crashes if any row lacks `active`.  
  **Smallest fix:** use `row.get('active')` (or default `False`).

Smallest safe patch:

```python
def load_users(path):
    with open(path) as f:
        data = json.load(f)
    users = [User(**row) for row in data if row.get('active')]
    return users
```

If you want, I can also provide a strict variant that raises a clear validation error when `active` is missing instead of silently skipping.