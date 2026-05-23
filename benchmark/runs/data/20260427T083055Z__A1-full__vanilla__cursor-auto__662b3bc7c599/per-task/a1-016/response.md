- **High** — File handle leak on normal/exception paths (`line 2`): `open(path)` is never closed, which can exhaust file descriptors over time.  
  **Smallest fix:** use a context manager.
  ```python
  with open(path) as f:
      data = json.load(f)
  ```

- **Medium** — Possible `KeyError` when `active` is missing (`line 4`): `row['active']` crashes if any row lacks that key.  
  **Smallest fix:** use `.get('active', False)` (or `if row.get('active')`).
  ```python
  users = [User(**row) for row in data if row.get('active', False)]
  ```

- **Low** — `json` is used but not shown as imported (`line 3`): this raises `NameError` unless imported elsewhere.  
  **Smallest fix:** add:
  ```python
  import json
  ```

Minimal corrected version:

```python
import json

def load_users(path):
    with open(path) as f:
        data = json.load(f)
    users = [User(**row) for row in data if row.get('active', False)]
    return users
```