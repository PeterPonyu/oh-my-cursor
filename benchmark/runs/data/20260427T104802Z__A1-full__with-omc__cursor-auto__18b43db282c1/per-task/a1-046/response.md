I’ll quickly scan the test tree to identify the `client` fixture definition and all pytest callsites, then I’ll give you a concrete batched-edit plan with file scope, ordering, conflict controls, and a verification command.I found only two local test files with the default name pattern, so I’m broadening the scan to all Python files containing pytest usage and any `client` fixture references to build an accurate per-file scope.Current workspace does not contain pytest fixture files (`conftest.py` not found, no `pytest` imports), so I can’t enumerate the expected 30 files from this checkout.  
Here is the **batched edit plan** you can run in the target repo/state where those files exist.

## 1) Explicit rename patterns

- **Fixture definition pattern** (only in `conftest.py`-style fixture modules):
  - Match: `@pytest.fixture` + `def client(`  
  - Replace: `def api_client(`
- **Callsite patterns** (tests and fixture-dependent helpers):
  - Function args: `def test_x(..., client, ...):` -> `def test_x(..., api_client, ...):`
  - Fixture injection in helper fixtures: `def some_fixture(client):` -> `def some_fixture(api_client):`
  - Indirect fixture lookup:
    - `@pytest.mark.usefixtures("client")` -> `@pytest.mark.usefixtures("api_client")`
    - `request.getfixturevalue("client")` -> `request.getfixturevalue("api_client")`
    - `@pytest.mark.parametrize(..., indirect=["client"])` -> `indirect=["api_client"]`

## 2) Per-file scope (how to generate exact 30-file list)

Run these to produce the concrete file scopes before editing:

- Definition files:
  - `rg -n --glob "**/conftest.py" "def\\s+client\\s*\\("`
- Callsite files (argument name usage):
  - `rg -n --glob "**/*test*.py" "\\bclient\\b"`
- String-based fixture references:
  - `rg -n --glob "**/*test*.py" "usefixtures\\(\"client\"\\)|getfixturevalue\\(\"client\"\\)|indirect=\\[.*\"client\".*\\]"`

Then classify each matched file as:
- **D** = fixture definition file (`conftest.py`)
- **C** = pure callsite file
- **DC** = both (rare, but possible)

## 3) Dependency order and justification

Recommended order: **definition first, then callsites, then string refs** in one short-lived branch/commit batch.

- Why definition-first:
  - Pytest resolves by fixture name; once callsites move to `api_client`, old definition name breaks immediately.
  - If definition is updated first, temporary state still works for old callsites if you keep a brief alias during the batch (see conflict-avoidance below).
- If you cannot do atomic batch commit, use a transitional alias in `conftest.py`:
  - Keep `api_client` as canonical fixture.
  - Add temporary compatibility wrapper `client` fixture delegating to `api_client`.
  - Remove alias after all callsites are migrated.

## 4) Conflict-avoidance strategy

- Use **word-boundary-safe** edits only (`\bclient\b`) to avoid touching:
  - `http_client`, `client_id`, `anthropic_client`, etc.
- Limit automated replace scope to:
  - `**/conftest.py`, `**/test_*.py`, `**/*_test.py`
- Handle string-literal fixture names separately (do not rely on arg rename pass).
- Don’t rename non-pytest DI contexts (e.g., FastAPI `TestClient` variable named `client`) unless it is actually the fixture parameter.

## 5) Verification command

Run fixture-focused verification after edits:

- Quick correctness sweep:
  - `rg -n --glob "**/*.py" "\\bdef\\s+client\\s*\\(|\\bclient\\b" | rg -v "http_client|client_id|anthropic_client"`
- Pytest run (targeted first, then full):
  - `pytest -q -k "not slow"`
  - `pytest -q`

If you want, I can next generate a **ready-to-run scripted batch edit sequence** (safe `rg` + `python` rewrite + post-check) once you point me at the repo snapshot containing those 30 pytest files.