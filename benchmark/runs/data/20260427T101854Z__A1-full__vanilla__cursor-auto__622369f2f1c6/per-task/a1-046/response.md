I’ll scan the test tree to identify the exact `conftest.py` fixture definition and all `client` usages, then I’ll give you a concrete batched-edit plan with per-file scope and execution order.I can’t produce a real per-file scope yet because the current workspace is empty (`/tmp/cursor-vanilla-m8jr3pc3` has no repo/files).  
If you point me at the repo, I’ll return the exact 30-file list immediately.

Here’s the batched edit plan you asked for, ready to apply:

- **Definition pattern (in `conftest.py`)**
  - Replace fixture function name only:
    - `def client(...):` -> `def api_client(...):`
  - Keep decorator and body unchanged.
  - Optional alias window (if you want zero-break transition):
    - add `@pytest.fixture(name="client")` above `def api_client` temporarily, then remove later.

- **Callsite patterns (all pytest files)**
  - Rename fixture injection in function params:
    - `def test_x(client, ...)` -> `def test_x(api_client, ...)`
  - Rename fixture usage inside test body:
    - `client.get(...)` -> `api_client.get(...)`
  - Rename fixture in indirect/mark usage:
    - `@pytest.mark.usefixtures("client")` -> `@pytest.mark.usefixtures("api_client")`
    - parametrize strings/tuples containing `"client"` where it means fixture name.
  - Do **not** touch non-fixture meanings:
    - local vars named `client` unrelated to fixture
    - imports/classes/constants containing `client` text
    - HTTP client objects in non-test modules.

- **Per-file scope (how to enumerate explicitly)**
  1. Fixture definition file(s):
     - `rg -n "def\\s+client\\s*\\(" --glob "**/conftest.py"`
  2. Test files with fixture references:
     - `rg -n "\\bclient\\b|usefixtures\\(\"client\"\\)" --glob "**/test*.py" --glob "**/*test*.py"`
  3. Build final explicit file list from these hits (expected: 30 pytest files + `conftest.py`).

- **Dependency order (and why)**
  - **Preferred single-commit atomic rename:** edit definition + all callsites together, then run tests.
    - Justification: avoids any intermediate broken state where pytest can’t resolve fixture.
  - **If doing multiple commits:** change callsites first **only if** temporary alias exists; otherwise definition+callsites must be same batch.
  - So practical order:
    1. Add temporary alias (optional safety)
    2. Bulk rename callsites
    3. Remove alias (if added)

- **Conflict-avoidance strategy**
  - Use AST-aware rename (or constrained regex) scoped to tests + `conftest.py` only.
  - Exclude non-test directories (`src/`, `app/`, etc.) from replacement pass.
  - Review each changed hunk for:
    - `client` inside string literals not representing fixture names
    - shadowed local `client` variables
    - fixture factories returning a client object but not named fixture arg.
  - Keep batch size manageable (e.g., 10 files per chunk) to reduce merge conflict risk.

- **Verification command**
  - Fast fixture-safety + full tests:
    - `pytest --collect-only -q`
    - `pytest -q`
  - Residual old-name check:
    - `rg -n "\\bclient\\b|usefixtures\\(\"client\"\\)" --glob "**/test*.py" --glob "**/*test*.py" --glob "**/conftest.py"`

If you share the actual repo path (or open it in this workspace), I’ll generate the exact per-file scope list and a concrete chunk-by-chunk execution sequence.