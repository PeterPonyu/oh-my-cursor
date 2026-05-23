I’ll run this as a full autonomous workflow: first I’m loading the autopilot skill instructions, then I’ll implement `GET /healthz` and report each required phase with gate criteria plus verification commands before advancing.I’ve loaded the autopilot protocol and next I’m locating the FastAPI app entrypoint so I can implement the endpoint and run phase-gated verification end to end.I found no existing FastAPI project in this workspace, so I’m scaffolding a minimal service with the requested `GET /healthz` behavior plus a test, then I’ll run verification commands phase-by-phase.I’ve implemented the endpoint and test; next I’m running the verification commands (install + tests) so I can gate progression through execution, QA, and review phases.Implemented a minimal FastAPI service surface with `GET /healthz` returning status + git SHA fallback, plus a test harness.

Changed files:
- `app/main.py`
- `app/__init__.py`
- `tests/test_healthz.py`
- `requirements.txt`

Key implementation:
- `healthz()` now returns:
  - `status: "ok"`
  - `version: <git rev-parse HEAD>` (or `"unknown"` if git metadata is unavailable)

```1:30:app/main.py
from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi import FastAPI

app = FastAPI()


def _git_sha(repo_root: Path | None = None) -> str:
    root = repo_root if repo_root is not None else Path(__file__).resolve().parents[1]
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return "unknown"

    sha = result.stdout.strip()
    return sha if sha else "unknown"


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "version": _git_sha()}
```

## Phase Gates (Autopilot Style)

- **Expansion**
  - **Goal:** Convert request into concrete API spec.
  - **Gate criteria:** endpoint path, method, response schema, SHA source/fallback all specified.
  - **Verification command:** `rg "healthz|git-sha|version" app tests`
  - **Advance when:** spec is unambiguous and mapped to files.

- **Planning**
  - **Goal:** Define file-level implementation/test plan.
  - **Gate criteria:** app route file + test file + dependency footprint identified.
  - **Verification command:** `ls app tests && rg "FastAPI|TestClient" app tests`
  - **Advance when:** each requirement has an implementation location.

- **Execution**
  - **Goal:** Add endpoint and SHA resolver.
  - **Gate criteria:** `app/main.py` contains route and git SHA function; import graph is valid.
  - **Verification command:** `python -m py_compile app/main.py`
  - **Advance when:** compile check passes.

- **QA**
  - **Goal:** Validate behavior.
  - **Gate criteria:** test asserts `status == "ok"` and non-empty string `version`.
  - **Verification commands:**  
    - `python -m pip install -r requirements.txt`  
    - `python -m pytest -q`
  - **Advance when:** tests pass with clean exit.

- **Review** *(must be separate context)*
  - **Goal:** Independent quality/security/behavior review.
  - **Why separate context:** review should be isolated from implementation bias (fresh reviewer context or separate reviewer agent/session).
  - **Gate criteria:** reviewer confirms contract, fallback semantics, and test adequacy.
  - **Verification commands:**  
    - `rg "subprocess.run|rev-parse|/healthz" app`  
    - `python -m pytest -q`
  - **Advance when:** no blocking findings remain.

- **Cleanup**
  - **Goal:** Finalize artifacts and handoff instructions.
  - **Gate criteria:** only intended files changed; runbook commands documented.
  - **Verification command:** `ls app tests && rg "healthz|version" app tests`
  - **Advance when:** user has clear run/verify commands.

## Notes on Command Execution

This environment only allowed a limited shell command set during this run, so I could not execute `pip`/`pytest` here. The code and tests are in place; please run:

- `python -m pip install -r requirements.txt`
- `python -m pytest -q`

If you want, I can also add a tiny `uvicorn` startup file and a curl-based smoke test command sequence.