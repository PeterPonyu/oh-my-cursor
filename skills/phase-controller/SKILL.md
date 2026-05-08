---
name: phase-controller
description: Orchestration-first entry point. Detect the current workflow phase from a checked-in state file, route the next step to the right role and skill, and keep acceptance criteria, evidence, and failure handling aligned with the workflow-state contract.
---

# Phase controller

> **Cursor host note.** This is the orchestration-first skill for `oh-my-cursor`. It treats the workflow as an explicit state machine that is **file-backed**, **human-visible**, and **bounded**. There is no background daemon, hidden queue, or automatic retry; each phase advance is an explicit action on a checked-in JSON document.

## Governance

### Ownership Class
- **repo-owned**: YES — This skill is checked in at `skills/phase-controller/SKILL.md` and is the orchestration entry point for the repo's workflow-state contract.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: NO — Cursor does not document a workflow-state primitive; this is repo-owned.
- **checked-in-artifact**: YES — Proof: `.cursor/state/workflow-state.schema.json`, `.cursor/agents/orchestrator.md`, `.cursor/hooks.json` (state-watcher, stop-gate hooks), `scripts/validate-workflow-state.py`.
- **runtime-smoke**: YES (optional) — When `cursor-state-bridge` MCP is installed, bridge tools (`state_init`, `state_set_phase`, etc.) provide runtime proof; default install excludes MCP.

### Claim Summary
This skill provides the orchestration entry point for `oh-my-cursor` workflows. It reads the checked-in workflow-state document (`.cursor/state/workflow-state.json`), detects the current phase, and routes to the appropriate agent or skill. The state contract is repo-owned and file-backed; writes go through the optional `cursor-state-bridge` MCP server when available, or through direct file updates otherwise. All phases, statuses, and role mappings are defined in the checked-in schema and agent prompts.

## MCP Integration Points

| Tool/Resource | MCP Server | Purpose | Required | Status |
|---|---|---|---|---|
| `state_init` | cursor-state-bridge | Initialize workflow-state document | No | optional |
| `state_set_phase` | cursor-state-bridge | Advance to next phase | No | optional |
| `state_update_acceptance_criterion` | cursor-state-bridge | Record criterion pass/fail | No | optional |
| `state_record_failure` | cursor-state-bridge | Log phase failure | No | optional |
| `state_history_append` | cursor-state-bridge | Append run notes | No | optional |
| `state_read` | cursor-state-bridge | Read current state | No | optional |

**Note**: MCP bridge is opt-in via `./scripts/install-local-plugin.sh --with-mcp`. Default install uses direct file I/O with `.cursor/state/workflow-state.json`.

## Hooks Dependencies

| Hook Event | Script | Purpose | Dependency |
|---|---|---|---|
| `postToolUse` | `state-watcher.py` | Observes tool execution and may trigger state updates | optional |
| `stop` | `stop-gate.py` | Reads current phase before session stop | optional |
| `preCompact` | `compact-reminder.py` | Reminds user of current phase before compacting | optional |

**Note**: Hooks are read-only observers; they do not write workflow-state directly. Writes go through MCP bridge or direct file updates.

## Orchestration Role

- **Lifecycle phase(s)**: All phases (intake → research → plan → execute → verify → review → done)
- **Invoked by**: User at session start, or by `auto-execute`, `iterate-loop` when resuming
- **Invokes**: Routes to agents (`orchestrator`, `researcher`, `planner`, `implementer`, `verifier`, `critic`, `debugger`, `tracer`) and skills (`plan`, `iterate-loop`, `review`, `debug`, `trace`, etc.)
- **State contract**: Reads/writes `.cursor/state/workflow-state.json` (or per-task archive at `docs/plans/<task-id>/workflow-state.json`)
- **Failure handling**: Records failures via `state_record_failure` MCP tool or direct JSON update; routes to `debugger` or `tracer` agents

## State contract

The state document follows
[`.cursor/state/workflow-state.schema.json`](../../.cursor/state/workflow-state.schema.json).

Phases:

```
intake → research → plan → execute → verify → review → done
                                              ↘ blocked
```

Statuses per phase: `pending | in_progress | passed | failed | blocked`.

The entry-point role is `.cursor/agents/orchestrator.md`. Roles routed by this
controller map to checked-in agents under
`.cursor/agents/`:

| Phase | Recommended role | Agent prompt |
| --- | --- | --- |
| any | orchestrator | `.cursor/agents/orchestrator.md` |
| research | researcher, explore | `.cursor/agents/researcher.md`, `.cursor/agents/explore.md` |
| plan | planner | `.cursor/agents/planner.md` |
| execute | implementer (or skill) | `.cursor/agents/implementer.md` |
| verify | verifier, test-engineer | `.cursor/agents/verifier.md`, `.cursor/agents/test-engineer.md` |
| review | critic, security-reviewer, code-reviewer | `.cursor/agents/critic.md`, `.cursor/agents/security-reviewer.md`, `.cursor/agents/code-reviewer.md` |
| any failure | debugger, tracer | `.cursor/agents/debugger.md`, `.cursor/agents/tracer.md` |

## When to use

Use this skill at the start of any non-trivial task and before stopping a
session. It complements existing skills (`plan`, `iterate-loop`, `review`,
`debug`, `trace`) by deciding **which one to invoke next**. `debug` is the
diagnosis-first lane; `trace` is its causal-investigation peer for harder
"why did this happen?" questions.

## Steps

1. **Locate or create the state file.** The canonical location is
   `.cursor/state/workflow-state.json`; this is the path that
   `stop-gate.py`, `compact-reminder.py`, `state-watcher.py`, and the
   default bridge resolver all read. Per-task archives at
   `docs/plans/<task-id>/workflow-state.json` are opt-in (pass `task_id`
   when calling `state_init` to use that subdirectory). Agent-callable
   writes go through the `cursor-state-bridge` MCP tools (`state_init`,
   `state_set_phase`, `state_update_acceptance_criterion`,
   `state_record_failure`, `state_history_append`, `state_read`); both
   targets share the bridge's `file_lock` invariant. Validate the
   on-disk document against
   `.cursor/state/workflow-state.schema.json` with the read-only
   validator `python3 scripts/validate-workflow-state.py <path>`; the
   validator does not write and remains agent-callable.
2. **Detect the current phase.** Read `phase` and `status`. If `phase` is
   missing, set `phase=intake`, `status=pending`.
3. **Decide the next action.**
   - `intake` → record `task_id`, `title`, and an initial acceptance-criteria
     list, then advance to `research`.
   - `research` → invoke the `researcher` agent, capture findings, then advance
     to `plan`.
   - `plan` → invoke the `planner` agent or the `plan` skill, finalize the
     acceptance-criteria list, then advance to `execute`.
   - `execute` → use the appropriate implementation skill (`auto-execute`,
     `iterate-loop`, etc.). Mark each acceptance criterion as `passed` only when
     evidence is captured.
   - `verify` → invoke the `verifier` agent. It must check evidence, not run
     code itself.
   - `review` → invoke `critic` **always**; additionally invoke
     `security-reviewer` when the change touches secrets, auth, supply chain,
     or external surfaces. Both reviewers' verdicts feed the shared loop gate
     defined in `skills/iterate-loop/SKILL.md` step 7: `APPROVE` /
     `SAFE TO MERGE` => `pass`, `COMMENT` / `FIX HIGH+ FIRST` => `comment`,
     `REQUEST CHANGES` / `DO NOT DEPLOY` => `block`. Advance to `done` only
     when every reviewer that ran maps to `pass` or `comment`.
   - `done` → set `status=passed` and stop. The `stop-gate.py` hook will use
     this state to confirm closure.
   - `blocked` → record the blocker, set `failure.type` to one of
     `transient | fixable | needs_replan | escalate | flaky | regression`, and
     surface to the user.
4. **Handle failures explicitly.** When `status=failed`, route to the
   `debugger` agent first. Record the diagnosis under the failing acceptance
   criterion before retrying. Cap retries at three (matches the schema bound).
5. **Update history.** Append a `history` entry on every phase transition with
   `phase`, `status`, a short `note`, and `at` (ISO date is enough; the schema
   only requires the field to be a string).
6. **Keep claims bounded.** Treat each acceptance criterion as a `repo-owned`
   `checked-in-artifact` claim only when its `evidence` field points to a
   checked-in file or a reproducible script invocation.

## Output contract

Each invocation should produce a single JSON object the user can copy into the
state file:

```json
{
  "phase": "verify",
  "status": "in_progress",
  "current_role": "verifier",
  "next_action": "run scripts/check-local-plugin-install.sh and mark AC-002",
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "criterion": "...",
      "status": "passed",
      "evidence": "scripts/check-local-plugin-install.sh"
    }
  ]
}
```

## Boundaries

- Do not invent agents, phases, or statuses outside the schema.
- Do not modify state on behalf of the user without showing the proposed
  document first.
- Do not claim background execution. The `stop-gate.py` hook only **reads**
  the state; it never writes it.
- This skill is the orchestration layer; the actual code edits, builds, and
  tests still happen in the appropriate worker skill or through the user.

## Local validation

Run from the repo root after editing a state file:

```bash
python3 scripts/validate-workflow-state.py path/to/workflow-state.json
```

The validator confirms the document conforms to the schema, that statuses are
allowed values, and that `failure.retry_count` stays within the bound.
