# Workflow state (repo-owned, file-backed)

This directory ships the **workflow-state contract** that hooks, skills, and
agents in `oh-my-cursor` share. It is intentionally:

- **file-backed**: a JSON document, not a daemon;
- **human-visible**: anyone can read it in a normal file editor;
- **opt-in**: tasks are not required to maintain a state file, but when one
  exists the `stop-gate.py` hook will use it to remind you about pending
  acceptance criteria; and
- **bounded**: no automatic mutation, no background worker.

## Files

- `workflow-state.schema.json` — JSON Schema describing the allowed phases,
  statuses, role names, and evidence shape.
- `workflow-state.example.json` — Reference document showing how a real task
  state looks. Use it as a template, not as live state.
- `workflow-state.py` — stdlib-only library API (`init_state`, `set_state`,
  `update_acceptance_criterion`, `record_failure`, `append_history`,
  `read_state`) with shared `file_lock` and atomic writes via tmp-file rename.
  The `cmd_*` argparse shims provide the CLI interface
  (`python3 .cursor/state/workflow-state.py {init,set,ac,fail}`).
- `_locking.py` — POSIX `fcntl` advisory `file_lock` context manager used by
  both the CLI library and the MCP bridge to serialise concurrent writes.

## Runtime artifacts (never durable)

These files may appear during active sessions but are not checked in and
should not be relied upon between runs:

- `active-role.json` — single-active-subagent record written by
  `subagent-bootstrap.py` (via `_active_role.py`) and cleared by
  `subagent-summary.py`. Consulted by `tool-guard.py` for role-based
  tool allowlists.
- `*.lock` — transient `fcntl` advisory lock files created during writes;
  removed when the lock context exits.
- `workflow-state.json` — the live state document when one exists; always
  written atomically via tmp-file + `os.replace`.

## Usage

1. When starting a non-trivial task, create a state file (for example
   `docs/plans/<task-id>/workflow-state.json`) that follows the schema.
2. The `phase-controller` skill (`skills/phase-controller/SKILL.md`) describes
   how to advance phases and update acceptance criteria.
3. Write or update the file intentionally with `.cursor/state/workflow-state.py`
  (available in the installed plugin payload), the repository wrapper
  `scripts/workflow-state.py`, or by editing JSON directly when that is
  clearer.
4. The `stop-gate.py` hook can read a workflow-state file passed via the
   `OH_MY_CURSOR_WORKFLOW_STATE` environment variable or via a JSON path field
   inside the stop event. When acceptance criteria are still pending, it emits
   a clear reminder instead of a generic message.
5. The `scripts/validate-workflow-state.py` validator lets you check any state
   document locally.

## Boundaries

- This repo does **not** ship a background runner that reads or writes the
  state on its own.
- Hooks remain conservative; they may reference the state, but they will not
  mutate it.
- Long-lived orchestration, retry queues, or multi-session resume are
  Cursor host-product capabilities and stay out of scope here.

## `.cursor/state/` vs `.omc/state/` — what this repo owns

Two state directories may coexist in a workspace. Only one is owned by this
repo.

| Path | Owner | Schema | Hook reads | Hook writes |
| --- | --- | --- | --- | --- |
| `.cursor/state/workflow-state.json` | this repo (`oh-my-cursor`) | `workflow-state.schema.json` | yes (14 hooks) | no — only `workflow-state.py` and the bridge write |
| `.cursor/state/active-role.json` | this repo (Stage 4) | single-role record | `tool-guard.py` | `subagent-bootstrap.py` writes; `subagent-summary.py` clears |
| `.omc/state/*` | the user's global oh-my-claudecode harness | none in this repo | no | no |

`.omc/state/*` (e.g. `mission-state.json`, `subagent-tracking.json`,
`hud-stdin-cache.json`) is written by the user's globally installed
`oh-my-claudecode` harness from `~/.claude/CLAUDE.md`. **This repo does not
read, write, or contract about it.** Treat it as opaque scratch.

**Decision rule for contributors**: when adding cross-system state, extend
`.cursor/state/`, never `.omc/state/`. The OMC harness is upstream and out of
scope for the Cursor port's hook layer.

## Read vs write split

- **Hooks read directly off disk** for performance. `stop-gate.py`,
  `compact-reminder.py`, `session-bootstrap.py`, and similar consumers parse
  `workflow-state.json` without going through the bridge. This is acceptable
  for read-only consumers because writers always settle the file via
  `os.replace` before releasing the shared `file_lock`.
- **All writes go through one of two paths**: the library API in
  `.cursor/state/workflow-state.py` (CLI shim) or the
  `cursor-state-bridge` MCP tools (agent-callable). Both share the same
  `file_lock` callable identity via the module-cache trick in
  `mcp/cursor-state-bridge/state_io.py:_load_workflow_state`. Direct edits to
  `workflow-state.json` are intercepted by `tool-guard.py` and require user
  confirmation.
