# Workflow state (repo-owned, file-backed)

This directory ships the **workflow-state contract** that hooks, skills, and
agents in `oh-my-cursor` share. It is intentionally:

- **file-backed**: a JSON document, not a daemon;
- **human-visible**: anyone can read it in a normal file editor;
- **opt-in**: tasks are not required to maintain a state file, but when one
  exists the `stop-gate.ts` hook will use it to remind you about pending
  acceptance criteria; and
- **bounded**: no automatic mutation, no background worker.

## Files

- `workflow-state.schema.json` — JSON Schema describing the allowed phases,
  statuses, role names, and evidence shape.
- `workflow-state.example.json` — Reference document showing how a real task
  state looks. Use it as a template, not as live state.
- `workflow-state.ts` — compatibility shim that re-exports the packaged
  workflow-state API and CLI from `src/oh_my_cursor/workflow_state/`.
  Direct calls such as `node --experimental-strip-types .cursor/state/workflow-state.ts init ...`
  still work for installed payloads.
- `_locking.ts` — compatibility shim that re-exports the canonical POSIX
  `file_lock` from `src/oh_my_cursor/workflow_state/locking.ts`.
- `src/oh_my_cursor/workflow_state/` — executable implementation for the
  API (`init_state`, `set_state`, `update_acceptance_criterion`,
  `record_failure`, `append_history`, `read_state`), CLI, and lock.

## Runtime artifacts (never durable)

These files may appear during active sessions but are not checked in and
should not be relied upon between runs:

- `active-role.json` — single-active-subagent record written by
  `subagent-bootstrap.ts` and cleared by
  `subagent-summary.ts`. Consulted by `tool-guard.ts` for role-based
  tool allowlists.
- `*.lock` — transient `fcntl` advisory lock files created during writes;
  removed when the lock context exits.
- `workflow-state.json` — the live state document when one exists; always
  written atomically via tmp-file + `os.replace`.

## Usage

1. When starting a non-trivial task, create a state file that follows the
   schema. Use `.cursor/state/workflow-state.json` only as live runtime state,
   not as a durable plugin asset; use `docs/plans/<task-id>/workflow-state.json`
   or a temporary path for validation smokes.
2. The `phase-controller` skill (`skills/phase-controller/SKILL.md`) describes
   how to advance phases and update acceptance criteria.
3. Write or update the file intentionally with the `cursor-state-bridge` MCP
   tools, the repository wrapper `scripts/workflow-state.ts`, or the installed
   compatibility shim `.cursor/state/workflow-state.ts`. Avoid
   direct JSON edits unless the user explicitly approves the exact change.
4. The `stop-gate.ts` hook can read a workflow-state file passed via the
   `OH_MY_CURSOR_WORKFLOW_STATE` environment variable or via a JSON path field
   inside the stop event. When acceptance criteria are still pending, it emits
   a clear reminder instead of a generic message.
5. The `scripts/validate-workflow-state.ts` validator lets you check any state
   document locally.

## Boundaries

- This repo does **not** ship a background runner that reads or writes the
  state on its own.
- Hooks remain conservative; they may reference the state, but they will not
  mutate it.
- Long-lived orchestration, retry queues, or multi-session resume are
  Cursor host-product capabilities and stay out of scope here.

## `.cursor/state/` vs `.omcs/` vs `.omc/state/` — what this repo owns

Up to three runtime directories may coexist in a workspace. Only the first two
belong to this repo; only `.cursor/state/` is a contracted, schema-backed
surface.

| Path | Owner | Schema | Hook reads | Hook writes |
| --- | --- | --- | --- | --- |
| `.cursor/state/workflow-state.json` | this repo (`oh-my-cursor`) | `workflow-state.schema.json` | yes (14 hooks) | no — only the workflow-state package/CLI and the bridge write |
| `.cursor/state/active-role.json` | this repo (Stage 4) | single-role record | `tool-guard.ts` | `subagent-bootstrap.ts` writes; `subagent-summary.ts` clears |
| `.omcs/` | this repo (`oh-my-cursor`) | none — transient scratch | no | `_trace.ts` / MCP bridge trace; autopilot cancel token |
| `.omc/state/*` | the user's global oh-my-claudecode harness | none in this repo | no | no |

`.omcs/` (note the trailing **s**) is **this port's own** workspace-private
runtime scratch directory. It holds the MCP bridge trace
(`.omcs/cursor-state-bridge/trace.jsonl`), the hook trace
(`.omcs/hook-trace.log`), and the autopilot cancel token (`.omcs/cancel`). It is
gitignored and **never** a checked-in `repo-owned` surface; see
[`docs/state-contract.md`](../../docs/state-contract.md) "Local scratch-state
policy". Do not confuse it with `.omc/` below — the names differ by one
character but the ownership is opposite.

`.omc/state/*` (e.g. `mission-state.json`, `subagent-tracking.json`,
`hud-stdin-cache.json`) is written by the user's globally installed
`oh-my-claudecode` harness from `~/.claude/CLAUDE.md`. It is a **foreign**
harness, out of scope for this repo, and (like `.omcs/`) gitignored. **This repo
does not read, write, or contract about it.** Treat it as opaque scratch.

**Decision rule for contributors**: when adding cross-system state, extend
`.cursor/state/`, never `.omc/state/`. The OMC harness is upstream and out of
scope for the Cursor port's hook layer.

## Read vs write split

- **Hooks read directly off disk** for performance. `stop-gate.ts`,
  `compact-reminder.ts`, `session-bootstrap.ts`, and similar consumers parse
  `workflow-state.json` without going through the bridge. This is acceptable
  for read-only consumers because writers always settle the file via
  `os.replace` before releasing the shared `file_lock`.
- **All writes go through one of two paths**: the packaged library API in `src/oh_my_cursor/workflow_state/` via the
  CLI compatibility shim or the `cursor-state-bridge` MCP tools
  (agent-callable). Both share the same canonical `file_lock` callable. Direct edits to
  `workflow-state.json` are intercepted by `tool-guard.ts` and require user
  confirmation.
