# Changelog

## 2026-05-06

### Plugin orchestration first
- introduced `docs/orchestration.md` as the orchestration-first overview that
  ties hooks, skills, agents, and shared workflow state into one explicit
  lifecycle (intake → research → plan → execute → verify → review → done →
  blocked)
- added the shared workflow-state contract under `.cursor/state/` with
  `workflow-state.schema.json`, `workflow-state.example.json`, and a README
- added `skills/phase-controller/SKILL.md` as the orchestration entry skill
- added `.cursor/agents/planner.md` and `.cursor/agents/researcher.md`
  read-only role prompts
- added `scripts/validate-workflow-state.py` for local schema validation

### Hook lifecycle rename
- renamed `.cursor/hooks/claim-proof-audit.py` → `.cursor/hooks/claim-guard.py`
- renamed `.cursor/hooks/completion-summary-audit.py` →
  `.cursor/hooks/stop-gate.py`
- `stop-gate.py` now optionally reads an active workflow-state document (via
  `OH_MY_CURSOR_WORKFLOW_STATE` or a `workflow_state` field in the stop event)
  and surfaces pending or failed acceptance criteria in its reminder
- updated `.cursor/hooks.json`, validators, smoke wrappers, install/check
  scripts, and `.cursor/hooks/README.md` to use the new lifecycle-style names
- the local install copy mode now also ships `.cursor/state/` so the workflow
  contract is available to a loaded Cursor plugin payload

## 2026-04-22

### Repo-root Cursor plugin promotion
- added a repo-root plugin manifest at `.cursor-plugin/plugin.json`
- added a minimal shipped plugin payload:
  - `rules/repo-owned-plugin-boundary.mdc`
  - `skills/local-plugin-check/SKILL.md`
- updated docs and validators so the repo now truthfully claims a small,
  checked-in Cursor plugin surface instead of only describing one

### Plugin install + smoke hardening
- added `scripts/install-local-plugin.sh` for reproducible local plugin setup
- added retry/backoff in `scripts/smoke-cursor-agent.sh` for transient
  connection-loss recovery in model-backed Cursor smoke
- refreshed benchmark evidence on top of the hardening commit so the checked-in
  proof matches the current install/smoke path
