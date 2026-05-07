# `cursor-state-bridge` tool surface

Six MCP tools mapped 1:1 to the workflow-state schema at
[`.cursor/state/workflow-state.schema.json`](../.cursor/state/workflow-state.schema.json).

## Tool table

| Tool | PR1 status | Library API (Phase 2) | Schema field touched |
| --- | --- | --- | --- |
| `state_read` | functional | `read_state(workspace, task_id?)` | (read-only) |
| `state_init` | planned-phase-2-3 (`-32601`) | `init_state(task_id, plan_id, ...)` | full document |
| `state_set_phase` | planned-phase-2-3 (`-32601`) | `set_state(phase=..., status?)` | `phase`, `status`, `history[]` |
| `state_record_failure` | planned-phase-2-3 (`-32601`) | `record_failure(message, phase?, retry_count?)` | `failure`, `history[]` |
| `state_update_acceptance_criterion` | planned-phase-2-3 (`-32601`) | `update_acceptance_criterion(ac_id, status, evidence?)` | `acceptance_criteria[]`, `history[]` |
| `state_history_append` | planned-phase-2-3 (`-32601`) | `append_history(event, ...)` | `history[]` |

### `state_read` (PR1 functional)

- **Params**: `{task_id?: string, workspace?: string}`. When `task_id` is
  provided the bridge reads
  `<workspace>/docs/plans/<task_id>/workflow-state.json`. When absent it
  reads `<workspace>/.cursor/state/workflow-state.json`.
- **Result shape**: `{"content": [{"type": "text", "text": "<json>"}]}`
  where `<json>` is the parsed state document serialized.
- **Errors**: `-32602` with `jail-escape:` prefix when the resolved path
  escapes one of the three jail roots; `-32603` on internal parse failure.
  Missing file is not an error — the bridge returns `{"content": [{"type":
  "text", "text": "no state"}]}`.

### `state_update_acceptance_criterion` evidence semantics

`evidence` is **optional** in the schema and stays optional at the tool
boundary. When provided, the bridge stores it verbatim. When absent, the
bridge keeps the existing value or writes an empty string. The schema is
not tightened by the tool.

## PR scope and promotion path

| Phase | Tools shipped | Acceptance criteria |
| --- | --- | --- |
| 1 (PR1) | `state_read` (functional); other 5 advertised but `-32601` | AC-101..AC-110 |
| 2 | locking shim + library refactor at `.cursor/state/_locking.py` and `.cursor/state/workflow-state.py`; `state_init`, `state_set_phase`, `state_record_failure` promoted to functional | AC-201..AC-209 |
| 3 | `state_update_acceptance_criterion`, `state_history_append` promoted; full six-tool functional surface | AC-301..AC-305 |

## Boundary

`mcp/cursor-state-bridge/**` is `repo-owned` `checked-in-artifact`. The
plan tracking these phases lives at
[`plans/mcp-state-bridge-2026-05/consensus-plan.md`](./plans/mcp-state-bridge-2026-05/consensus-plan.md)
under tracked development-process documentation.
