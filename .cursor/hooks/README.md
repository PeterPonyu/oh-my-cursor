# Cursor project hooks

This directory contains repo-owned lifecycle helpers for trusted Cursor
workspaces. The project hook manifest lives at `.cursor/hooks.json` and points
to the Python scripts in this directory. Names are short and lifecycle-style:

- `claim-guard.py` (event: `afterFileEdit`) inspects edited public files for
  overclaims and legacy comparison language, then emits JSON diagnostics. It
  exits successfully for ordinary warnings and only blocks severe unsupported
  claims.
- `stop-gate.py` (event: `stop`) reads stop-event JSON, surfaces a short
  reminder to verify acceptance criteria, and can read the active workflow
  state document (`.cursor/state/workflow-state.schema.json`) to list pending
  or failed acceptance criteria. It does not request another turn by default.

Both scripts use only the Python standard library so local validation stays
portable. The hooks **read** state; they never write it. Background workers,
cross-session resume, and queued retries remain `host-product-only` Cursor
capabilities and are intentionally out of scope here.

For the orchestration-first overview, see [`docs/orchestration.md`](../../docs/orchestration.md).
The shared workflow-state contract lives under [`.cursor/state/`](../state/README.md).
