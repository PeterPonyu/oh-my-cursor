# Multi-state transition compatibility

Status: First-pass peer workflow state model for concurrent skill activation.

## Canonical sources of truth

The workflow runtime treats workflow state as a combination of:

- Workflow-state file: `.cursor/state/workflow-state.json` (or per-task under `docs/plans/<task-id>/`)
- Active skill set: recorded in the workflow-state's `history` entries and `current_role` field
- Phase state: `phase` and `status` fields per the workflow-state schema

The `current_role` field records the single active agent role. When multiple skills or workflows are active concurrently, the `history[]` entries provide the canonical active-set inventory. Legacy fields like `phase` or `status` may remain, but must not override the authoritative history when multiple workflow members are live.

## Approved first-pass combinations

Allowed concurrent workflow patterns:

- Standalone single-workflow (any single skill or agent)
- `phase-controller + iterate-loop` — phase-driven execution with persistence
- `phase-controller + parallel-batch` — phase-driven execution with parallel workers
- `iterate-loop + review` — implementation loop with gated review pass

The resulting active set is peer state. Neither member is semantically primary just because it was activated first.

## Standalone-only workflows

These workflows remain standalone and must reject overlap attempts:

- `auto-execute` — when auto-execute is active, phase-controller must not advance phases
- `deep-interview` — interview mode must complete before any implementation workflow starts

A denied overlap must preserve the current state unchanged and log the rejection in `history[]`.

## Transition rules

Every writer or consumer that mutates workflow state must answer:

1. Is the requested skill/phase transition allowed from the current active state?
2. What is the resulting state if allowed?
3. What operator guidance should be shown if denied?

Default rule: deny without mutation. A transition is allowed only when an explicit combination is approved.

### Phase transition compatibility

| Current Phase | Next Phase | Allowed | Conditions |
|---|---|---|---|
| any | `blocked` | yes | With failure record |
| `intake` | `research` | yes | Task ID and title present |
| `research` | `plan` | yes | Research findings recorded |
| `plan` | `execute` | yes | Acceptance criteria list finalized |
| `execute` | `verify` | yes | Implementation evidence captured |
| `verify` | `review` | yes | Verification evidence present |
| `verify` | `execute` | yes | Verification found issues; backtrack allowed |
| `review` | `done` | yes | Review verdict: pass or comment |
| `review` | `execute` | yes | Review requested changes |
| `done` → any | re-open | no | Terminal state |

## History tracking

Every phase transition appends to `history[]`:

```json
{
  "phase": "verify",
  "status": "in_progress",
  "note": "handed off to verifier agent",
  "at": "2026-05-08T00:00:00Z"
}
```

The history array is capped at 50 entries (FIFO eviction). The full history is preserved in the MCP bridge's log but the state file retains only the most recent 50 entries to keep the file human-readable.

## Compatibility with team mode

When team mode is active, the workflow-state file tracks the lead's phase. Worker states are tracked in task files under `docs/plans/<team-id>/tasks/T-NNN.json`. The lead must not advance the workflow phase until all worker tasks for that phase are complete.

| Lead Phase | Worker State | Allowed |
|---|---|---|
| `execute` | workers in `in_progress` | yes (lead waits) |
| `verify` | workers completed | yes (lead reviews) |
| `verify` | workers still `in_progress` | no (wait for workers) |
| `done` | any worker not completed | no (all must complete) |

## Implementation notes

- The `cursor-state-bridge` MCP tools (`state_set_phase`, `state_record_failure`) enforce these transitions
- The `validate-workflow-state.py` script checks transition validity against the schema
- Direct JSON edits to `workflow-state.json` bypass transition checks; agents and skills must use MCP bridge tools
- The `state-watcher.py` hook observes state after every tool use and flags stale or contradictory state
