I’ll quickly scan the repo for pytest files and fixture usages so I can give you an exact, file-scoped batch plan (including ordering and verification) rather than a generic recipe.I didn’t find any Python/pytest files in the current workspace, so I’ll give you a concrete batch-edit plan you can apply once you’re in the target repo (or you can point me to the correct path and I’ll generate the exact 30-file list).## Batched Rename Plan (`client` -> `api_client`)

### 1) Explicit edit patterns

- **Fixture definition pattern** (in `conftest.py`):
  - From: `def client(...):`
  - To: `def api_client(...):`
  - Keep decorators/body unchanged (`@pytest.fixture`, scopes, yields/returns stay the same).

- **Fixture usage pattern** (tests/fixtures):
  - Function arg: `def test_x(client):` -> `def test_x(api_client):`
  - Method arg: `def test_x(self, client):` -> `def test_x(self, api_client):`
  - Fixture dependency arg: `def other_fixture(client):` -> `def other_fixture(api_client):`
  - Parametrize **indirect** name string: `@pytest.mark.parametrize("client", ..., indirect=True)` -> `"api_client"` (or tuple/list entries containing `client`).
  - `usefixtures` marker string: `@pytest.mark.usefixtures("client")` -> `"api_client"`
  - `request.getfixturevalue("client")` -> `"api_client"`

- **Do not blindly replace** unrelated `client` identifiers (locals, attributes, third-party fixtures in different contexts). Prefer pytest-aware patterns above.

---

### 2) Per-file scope (what to touch in each file)

Use this discovery first to build the 30-file scope list:

```bash
rg -n --glob '**/*.py' '\bclient\b|getfixturevalue\("client"\)|usefixtures\("client"\)|parametrize\('
```

Then classify each file:

- **Bucket A (definition):** file(s) containing `def client(` under `@pytest.fixture` (typically `conftest.py`).
- **Bucket B (callsites):** test files with `client` as function parameters.
- **Bucket C (string-based refs):** files with `"client"` in `usefixtures`, indirect `parametrize`, or `getfixturevalue`.
- **Bucket D (non-pytest false positives):** files where `client` is a normal variable/object and should not be renamed.

For your final batch plan, enumerate:
- `conftest.py` in Bucket A
- the 30 pytest files in B/C (only those with real fixture usage)

---

### 3) Dependency order and justification

Recommended order:

1. **Callsites first (B/C)**  
2. **Fixture definition last (A)**

**Why:** this minimizes broken intermediate states during incremental editing.  
- If you rename definition first, existing tests using `client` immediately fail fixture lookup.
- If you rename usages first, they fail only until definition is changed, and this is easier to complete in one quick final step.
- In a single atomic commit either order is fine, but for batched/manual edits, **callsites -> definition** is safer.

(If you use a true atomic codemod and commit once, order is less important.)

---

### 4) Conflict-avoidance strategy

- Limit edits to pytest files + `conftest.py` only.
- Rename only when `client` is:
  - a pytest fixture parameter in function signatures, or
  - a known fixture string reference (`usefixtures`, indirect parametrize, `getfixturevalue`).
- Skip:
  - `client = ...` locals/globals unless they are fixture functions.
  - attribute chains like `obj.client`.
  - external API clients not related to pytest fixtures.
- After first pass, run a targeted residual scan:
  - `rg -n --glob '**/*.py' '\bclient\b'`
  - Manually review remaining matches for legitimate non-fixture uses.

---

### 5) Verification command

Run full pytest plus residual fixture checks:

```bash
pytest -q && rg -n --glob '**/test*.py' --glob '**/*test*.py' '\bclient\b|usefixtures\("client"\)|getfixturevalue\("client"\)'
```

Optional stricter check (whole repo):
```bash
rg -n --glob '**/*.py' '\bdef client\s*\(|\bclient\b'
```

---

If you want, I can generate the **exact 30-file per-file checklist** automatically once you point me to the correct repository path.