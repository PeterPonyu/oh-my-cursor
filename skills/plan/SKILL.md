---
name: plan
description: Strategic planning workflow that turns a request into a small, reviewable Cursor-native plan before any code change.
---

# Plan

> **Cursor host note.** This skill is a documentation workflow, not a runtime
> orchestrator. It lives in `skills/plan/` so a Cursor session can load it on
> demand. Plans are written to `docs/plans/` (a normal repo path), not to a
> private `.omc/` state directory. If you need automatic activation, pair this
> skill with a project rule under `.cursor/rules/*.mdc`.

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

## Boundaries

- Plans live in `docs/plans/` (or wherever the host project conventionally
  stores planning notes). This skill does not write to `.omc/`, `.cursor/`,
  `.cursor-plugin/`, or anywhere else outside checked-in docs.
- Plans are advisory artifacts. They do not auto-trigger execution and do not
  promise that any particular Cursor mode (Agent, Manual, Custom) will be
  used. Mode selection stays with the user.
- This skill does not claim parity with Claude Code's `/plan` or with any
  multi-agent consensus loop. If you need adversarial review, invoke the
  `review` skill explicitly as a separate pass.

## Stop conditions

- Stop interviewing once acceptance criteria are clear and testable.
- Stop and escalate if a trade-off needs a business decision the user must own.
- If the user says "just start", write the smallest viable plan (goal + scope
  + criteria) and hand off.
