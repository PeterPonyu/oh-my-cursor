---
name: phase-controller
description: Orchestration-first entry point. Detect the current workflow phase from a checked-in state file, route the next step to the right role and skill, and keep acceptance criteria, evidence, and failure handling aligned with the workflow-state contract.
---

# Phase controller

This is the orchestration-first skill for `oh-my-cursor`. It treats the workflow
as an explicit state machine that is **file-backed**, **human-visible**, and
**bounded**. There is no background daemon, hidden queue, or automatic retry;
each phase advance is an explicit action on a checked-in JSON document.

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
| research | researcher | `.cursor/agents/researcher.md` |
| plan | planner | `.cursor/agents/planner.md` |
| execute | implementer (or skill) | implementation is user/agent-driven |
| verify | verifier | `.cursor/agents/verifier.md` |
| review | critic, security-reviewer | `.cursor/agents/critic.md`, `.cursor/agents/security-reviewer.md` |
| any failure | debugger | `.cursor/agents/debugger.md` |

## When to use

Use this skill at the start of any non-trivial task and before stopping a
session. It complements existing skills (`plan`, `iterate-loop`, `review`,
`debug`) by deciding **which one to invoke next**.

## Steps

1. **Locate or create the state file.** Default location for new tasks:
   `docs/plans/<task-id>/workflow-state.json`. Confirm the document validates
   against `.cursor/state/workflow-state.schema.json` using
   `python3 scripts/validate-workflow-state.py <path>`.
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
   - `review` → invoke `critic` and, when the change touches secrets, auth,
     supply chain, or external surfaces, also `security-reviewer`.
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
