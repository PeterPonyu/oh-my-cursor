I’ll implement this end-to-end by first checking the repo’s Python tooling and current test/lint/typecheck setup, then I’ll add a GitHub Actions workflow for PRs and report the phased execution with clear gate criteria, verification commands, and escalation conditions.I’ve loaded the autopilot guidance; next I’m inspecting the repo to detect the exact Python lint/typecheck/test commands so the CI workflow is accurate and executable.I found existing Python tests under `benchmark/` and an existing Actions setup; I’m now checking current workflow conventions so the new CI job aligns with repo style and command expectations.I confirmed there’s no existing Python toolchain config, so I’m adding a dedicated PR workflow with three explicit gates (`lint` → `typecheck` → `tests`) using repo-local Python paths under `benchmark/` and `scripts/`.Implemented a new PR-only Python CI workflow at `.github/workflows/python-ci.yml` with sequential gates:

```12:64:.github/workflows/python-ci.yml
jobs:
  lint:
    name: Lint (ruff)
    runs-on: ubuntu-latest
    # ...
      - name: Run ruff checks
        run: ruff check benchmark scripts

  typecheck:
    name: Typecheck (mypy)
    runs-on: ubuntu-latest
    needs: lint
    # ...
      - name: Run mypy
        run: mypy --ignore-missing-imports benchmark scripts

  tests:
    name: Tests (unittest)
    runs-on: ubuntu-latest
    needs: typecheck
    # ...
      - name: Run unit tests
        run: python -m unittest benchmark.test_scoring_invariants benchmark.test_history_cleanup
```

## Phased Run (Auto-Execute Plan)

- **Phase 0 — Scope Lock**
  - **Goal:** Confirm CI should run on PRs to `main` for Python paths.
  - **Gate:** Trigger is `pull_request` + `paths` filter for `benchmark/**/*.py`, `scripts/**/*.py`, and workflow file itself.

- **Phase 1 — Lint Gate**
  - **Command:** `ruff check benchmark scripts`
  - **Pass criteria:** Exit code `0` (no lint violations).
  - **Fail action:** Block pipeline; do not run typecheck/tests.

- **Phase 2 — Typecheck Gate**
  - **Command:** `mypy --ignore-missing-imports benchmark scripts`
  - **Pass criteria:** Exit code `0` (no type errors under configured strictness).
  - **Fail action:** Block tests.

- **Phase 3 — Test Gate**
  - **Command:** `python -m unittest benchmark.test_scoring_invariants benchmark.test_history_cleanup`
  - **Pass criteria:** All tests pass.
  - **Fail action:** PR remains failing.

- **Phase 4 — Review Handoff Rule**
  - **Rule:** Human/code review happens in a separate context after CI passes (CI validates quality gates; review validates intent/design/risk).

## Verification Commands (Local)

Run from repo root:

- `ruff check benchmark scripts`
- `mypy --ignore-missing-imports benchmark scripts`
- `python -m unittest benchmark.test_scoring_invariants benchmark.test_history_cleanup`

## Escalation to `deep-interview` (Ambiguity Triggers)

Escalate before further automation if any of these are unclear:

- Which branch targets should be enforced (`main` only vs multiple).
- Which Python directories/modules are in scope for lint/typecheck/tests.
- Required type strictness (`mypy` baseline vs strict profile).
- Test framework/source of truth (`unittest` vs `pytest`, and which suites must run).
- Dependency policy (tool install inline in workflow vs pinned requirements/lock).

If you want, I can follow up by adding pinned dev dependencies (e.g., `requirements-dev.txt`) and wiring the workflow to use that instead of direct `pip install` commands.