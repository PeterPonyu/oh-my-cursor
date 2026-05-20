---
name: plan
description: "[OMCS] Strategic planning workflow that turns a request into a small, reviewable Cursor-native plan before any code change."
---

# Plan

> **Cursor host note.** This skill is a documentation workflow, not a runtime orchestrator. It lives in `skills/plan/` so a Cursor session can load it on demand. Plans are written to `docs/plans/` (a normal repo path), not to a private runtime-state directory. If you need automatic activation, pair this skill with a project rule under `.cursor/rules/*.mdc`.

## Governance

### Ownership Class
- **repo-owned**: YES — Checked in at `skills/plan/SKILL.md` as a documentation workflow for Cursor workspaces.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: NO — Cursor does not document a planning primitive; this is repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/plan/SKILL.md`, `docs/plans/` directory structure, plan format template.
- **runtime-smoke**: NO

### Claim Summary
This skill provides a strategic planning workflow that turns vague requests into small, reviewable plans. Plans are written to `docs/plans/` as checked-in artifacts. No MCP or hooks required; this is a documentation-first workflow that complements `deep-interview` (for ambiguity gating) and feeds into `iterate-loop` or `auto-execute` for execution.

## MCP Integration Points

No direct MCP integration. This skill writes plans to `docs/plans/` as checked-in artifacts; state tracking is optional and handled by `phase-controller` or `auto-execute` if needed.

## Hooks Dependencies

No hooks dependencies. This skill is a documentation workflow that runs entirely within the Cursor chat.

## Orchestration Role

- **Lifecycle phase(s)**: intake, research, plan
- **Invoked by**: User directly, `auto-execute` (phase 1), `deep-interview` (after ambiguity gating)
- **Invokes**: Optionally `review` skill for validation; does not invoke other skills
- **State contract**: Writes to `docs/plans/<slug>.md` (checked-in artifact); no workflow-state updates
- **Failure handling**: If plan is rejected by user, loop back to step 1 or 2 with feedback

## Use when

- The request is broad, vague, or touches three or more files.
- You want explicit acceptance criteria before editing code.
- A teammate asked for a plan to review, not for code.

## Skip when

- The change is a single, obvious edit with clear scope.
- The user explicitly said "just do it" or "skip planning".
- The request is a question; answer it directly.

## Workflow

1. **Classify.** Decide between `direct` (specific, file-anchored request) and
   `interview` (vague request that needs scoping). State the choice in one line.
2. **Gather facts before asking.** Use Cursor's `@`-references, the agent's
   built-in file search, or `cursor-agent` (if available) to read the affected
   files first. Only then ask the user about preferences and trade-offs.
3. **Ask one question at a time** when interviewing. Never batch questions.
   Each follow-up should build on the previous answer.
4. **Draft the plan.** Write to `docs/plans/<short-slug>.md` using the format
   below. Keep it small enough that a reviewer can read it in one sitting.
5. **Optional review pass.** If the user wants stronger validation, run the
   `review` skill against the draft and incorporate the feedback.
6. **Hand off.** Do not implement inside this skill. Report the plan path so
   the user can pick how to execute it (manually, via `cursor-agent`, or via
   the `iterate-loop` / `auto-execute` skills).

## Plan format

```markdown
# Plan: <one-line summary>

## Goal
<what success looks like in plain English>

## Scope
- In: <files, surfaces, behaviors>
- Out: <explicit non-goals>

## Acceptance criteria
- [ ] <testable, concrete check>
- [ ] <testable, concrete check>

## Implementation steps
1. <step with file path, e.g. `src/foo.ts`>
2. <step>

## Risks
- <risk> -> <mitigation>

## Verification
- <command, lint, test, or manual check>
```

## Quality bar

- 80%+ of claims cite a specific file or path.
- 90%+ of acceptance criteria are testable, not aspirational.
- No vague terms without metrics ("fast" -> "p95 < 200 ms").
- Every risk has a mitigation.

## State sync (optional, via cursor-state-bridge MCP)

When the user wants the plan tracked alongside the workflow-state document,
hand off to the orchestrator with one of two patterns:

- For a brand-new task, recommend `state_init` with the plan's acceptance
  criteria and an initial `next_action`.
- For an existing task, recommend `state_set_phase` to advance to `plan` and
  `state_history_append` with a one-line summary of the plan's scope.

This skill does not call MCP tools itself; it produces an advisory artifact
under `docs/plans/` and recommends the next state write to the orchestrator.

## Boundaries

- Plans live in `docs/plans/` (or wherever the host project conventionally
  stores planning notes). This skill does not write to hidden runtime state,
  `.cursor/`,
  `.cursor-plugin/`, or anywhere else outside checked-in docs.
- Plans are advisory artifacts. They do not auto-trigger execution and do not
  promise that any particular Cursor mode (Agent, Manual, Custom) will be
  used. Mode selection stays with the user.
- This skill does not claim hidden consensus behavior. If you need adversarial
   review, invoke the `review` skill explicitly as a separate pass.

## Stop conditions

- Stop interviewing once acceptance criteria are clear and testable.
- Stop and escalate if a trade-off needs a business decision the user must own.
- If the user says "just start", write the smallest viable plan (goal + scope
  + criteria) and hand off.
