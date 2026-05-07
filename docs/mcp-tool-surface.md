# `cursor-state-bridge` tool surface

Six MCP tools mapped 1:1 to the workflow-state schema at
[`.cursor/state/workflow-state.schema.json`](../.cursor/state/workflow-state.schema.json).

## Tool table

| Tool | Status | Library API | Schema field touched |
| --- | --- | --- | --- |
| `state_read` | functional (PR1) | `read_state(path)` | (read-only) |
| `state_init` | functional (Phase 2) | `init_state(path, task_id, ...)` | full document |
| `state_set_phase` | functional (Phase 2) | `set_state(path, phase=..., status?)` | `phase`, `status`, `history[]` |
| `state_record_failure` | functional (Phase 2) | `record_failure(path, type, message, retry_count)` | `failure`, `history[]` |
| `state_update_acceptance_criterion` | placeholder (`-32601`, Phase 3) | `update_acceptance_criterion(path, ac_id, status, evidence?)` | `acceptance_criteria[]`, `history[]` |
| `state_history_append` | placeholder (`-32601`, Phase 3) | `append_history(path, note, ...)` | `history[]` |

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

| Phase | Tools shipped | Acceptance criteria | Status |
| --- | --- | --- | --- |
| 1 (PR1) | `state_read` (functional); other 5 advertised but `-32601` | AC-101..AC-110 | shipped |
| 2 | locking shim + library refactor at `.cursor/state/_locking.py` and `.cursor/state/workflow-state.py`; `state_init`, `state_set_phase`, `state_record_failure` promoted to functional | AC-201..AC-209 | shipped |
| 3 | `state_update_acceptance_criterion`, `state_history_append` promoted; full six-tool functional surface | AC-301..AC-305 | planned |

## Boundary

`mcp/cursor-state-bridge/**` is `repo-owned` `checked-in-artifact`. The
plan tracking these phases lives at
[`plans/mcp-state-bridge-2026-05/consensus-plan.md`](./plans/mcp-state-bridge-2026-05/consensus-plan.md)
under tracked development-process documentation.
