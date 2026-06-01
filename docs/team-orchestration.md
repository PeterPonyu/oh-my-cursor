# Team orchestration

Status: Baseline contract for multi-agent team coordination.

## Scope

This document defines the team orchestration model for oh-my-cursor. Teams are explicit, file-backed, and opt-in. There is no background daemon, hidden queue, or persistent worker pool.

## Delivery state lifecycle

Each team task moves through a bounded delivery lifecycle:

```
pending → claimed → in_progress → completed
                    ↘ blocked
pending → cancelled
```

### State transitions

| From | To | Allowed | Owner |
|---|---|---|---|
| `pending` | `claimed` | yes | worker (claim) |
| `pending` | `cancelled` | yes | lead (cancel) |
| `claimed` | `in_progress` | yes | worker (start) |
| `claimed` | `cancelled` | yes | lead (cancel) |
| `in_progress` | `completed` | yes | worker (submit) |
| `in_progress` | `blocked` | yes | worker (block) |
| `blocked` | `claimed` | yes | worker (unblock) |
| `blocked` | `cancelled` | yes | lead (cancel) |
| `completed` → any | re-open | no | terminal state |

Transition contract: completed is terminal for a delivery record. Cancelled records retain history but reject delivery transitions.

## Task file format

Team tasks are stored as individual JSON files under `docs/plans/<team-id>/tasks/`:

```json
{
  "id": "T-001",
  "team_id": "md-polish-squad",
  "subject": "Polish agent .md files",
  "description": "Read and refine every agents/*.md file...",
  "owner": "polish-agents",
  "status": "completed",
  "priority": "high",
  "dependencies": [],
  "created_at": "2026-05-08T00:00:00Z",
  "updated_at": "2026-05-08T00:05:00Z"
}
```

## Role definitions

A team consists of one lead and N workers:

| Role | Responsibilities |
|---|---|
| **Lead** | Define tasks, assign workers, synthesize results, declare done |
| **Worker** | Claim tasks, execute work, report evidence, request review |

The lead owns task creation and final integration. Workers execute bounded units of work with explicit acceptance criteria.

## Delivery protocol

1. **Lead creates tasks** and defines acceptance criteria per task
2. **Worker claims** a task (sets status to `claimed`)
3. **Worker executes** (reads files, makes edits, runs validation)
4. **Worker reports evidence** with changed file paths and validation output
5. **Lead reviews** evidence against acceptance criteria
6. **Lead marks complete** or requests changes

## Communication

Worker-to-lead communication is structured:

```json
{
  "task_id": "T-001",
  "verdict": "complete",
  "changed_files": ["path/to/file.md"],
  "evidence": "scripts/validate-plugin-structure.ts: PASS",
  "notes": "No additional issues found"
}
```

## Integration with workflow-state

When a team task maps to a workflow-state task:

- Team delivery state lives in `docs/plans/<team-id>/tasks/`
- Workflow-state lives in `docs/plans/<task-id>/workflow-state.json` or `.cursor/state/workflow-state.json`
- The lead sets workflow-state acceptance criteria and delegates sub-tasks to workers
- Workers update delivery state; the lead updates workflow-state

## State ownership

Team delivery state is repo-owned and file-backed. Workers write through:

- Direct file edits to `docs/plans/<team-id>/tasks/T-NNN.json` (when the task is the workspace leader)
- Through orchestrator relay when workers cannot write to the workspace directly

The cursor-state-bridge MCP tools support team state writes through `state_history_append` with team-scoped notes.

## Compatibility

Team mode is compatible with existing workflow phases:

- `intake` → lead defines team and tasks
- `research`, `plan` → workers execute in parallel
- `execute` → worker implementation phase
- `verify` → lead verifies worker evidence
- `review` → peer review across workers
- `done` → all tasks completed, evidence integrated
