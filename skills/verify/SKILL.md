---
name: verify
description: Bridge-backed verification that reads workflow-state acceptance criteria and writes passed or failed evidence via the MCP bridge.
---

# Verify

> **Cursor host note.** This is a verification skill for Cursor workspaces
> that have opted in to the repo-owned `cursor-state-bridge` MCP server. It
> reads workflow-state through the bridge, checks acceptance criteria against
> repo artifacts, and records criterion evidence through bridge tools only.
> It is not a hidden test runner and it does not edit workflow-state files
> directly.

## Use when

- A task has acceptance criteria recorded in workflow-state and the user asks
  to verify them.
- `iterate-loop`, `auto-execute`, or a manual implementation pass is ready for
  an acceptance-criteria gate.
- The `cursor-state-bridge` MCP server is available in the Cursor host and the
  current workspace should preserve verification evidence.

## Skip when

- No workflow-state exists yet; initialize or plan the task first.
- The user wants general code review; use `review` or `security-review`.
- The MCP bridge is not installed or not reachable; run `mcp-setup` first.
- The request only needs a local command result and no state update.

## Workflow

1. **Read state through the bridge.** Call `state_read` with the current
   `task_id` when one is known; otherwise read the default workspace state.
   If the bridge returns `no state`, stop and report that verification cannot
   start without workflow-state.
2. **Find pending criteria.** Parse `acceptance_criteria[]` from the returned
   JSON. Treat criteria with `pending`, empty, missing, or unclear status as
   pending. Do not invent criteria from chat text when the state document is
   present.
3. **Check each pending criterion against artifacts.** Use normal Cursor
   workspace evidence: source files, docs, tests, build output, logs, or
   terminal results. Prefer the narrowest command or artifact that proves the
   criterion. Record exact paths, commands, and observed outputs.
4. **Write each result through MCP.** For every criterion that was actually
   checked, call `state_update_acceptance_criterion` with its criterion id,
   status, and concise evidence. Use `passed` only when repo artifacts prove
   the requirement. Use `failed` when evidence disproves it or the required
   artifact is missing.
5. **Append run-level context when useful.** If the bridge is available and a
   note would help later resume, call `state_history_append` with a short
   verification note. Keep criterion outcomes on the criteria themselves.
6. **Hand back remaining work.** Re-read state with `state_read` after updates
   and report passed, failed, and still-pending criteria. Include the smallest
   next action for each failed or unverified item.

## MCP tools used

| Tool | Purpose |
|------|---------|
| `state_read` | Read current workflow-state or task-specific workflow-state. |
| `state_update_acceptance_criterion` | Record `passed` or `failed` plus evidence for one criterion. |
| `state_history_append` | Optional run-level verification note. |

The bridge exposes six tools in total: `state_read`, `state_init`,
`state_set_phase`, `state_record_failure`,
`state_update_acceptance_criterion`, and `state_history_append`. This skill
normally uses only the read, criterion update, and optional history tools.

## Evidence rules

- Evidence must name the artifact that proves the result: file path, test name,
  command, output snippet, or documented state field.
- One criterion can have multiple evidence points, but keep the MCP evidence
  string short enough to read in workflow-state.
- Passing evidence must be positive proof, not absence of a failure.
- Failed evidence must describe the observed gap, not blame the implementation.
- If a criterion cannot be checked because prerequisites are missing, leave it
  pending and report the blocker instead of marking it passed or failed.

## Report format

```
VERIFY REPORT
=============

State source: default workspace | docs/plans/<task_id>/workflow-state.json
Bridge: cursor-state-bridge reachable | unreachable

Passed
------
- <AC-ID> - <summary>
  Evidence: <path or command + result>

Failed
------
- <AC-ID> - <summary>
  Evidence: <observed gap>
  Next: <smallest fix or probe>

Pending / blocked
-----------------
- <AC-ID> - <reason it was not checked>

Final gate: PASS | FAIL | BLOCKED
```

## Boundaries

- The `cursor-state-bridge` is the only sanctioned write path for
  workflow-state. Never edit `.cursor/state/workflow-state.json` or
  `docs/plans/<task_id>/workflow-state.json` directly.
- This skill does not initialize tasks, change phases, or record failures
  unless the user explicitly asks for broader workflow management. Pair with
  `auto-execute` or `iterate-loop` for phase control.
- It does not claim MCP availability until the Cursor host exposes the bridge
  tools. If the tool surface is missing, report that as host-product setup and
  route to `mcp-setup`.
- It does not mark unchecked criteria as passed to make a gate green.

## Stop conditions

- All pending criteria were checked and updated through the bridge.
- The bridge is unreachable or returns malformed state.
- A required artifact or command is unavailable and blocks further evidence.
- The user says to stop.
