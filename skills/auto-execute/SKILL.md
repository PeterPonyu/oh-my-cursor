---
name: auto-execute
description: Autonomous execution pipeline - expand idea, plan, implement, QA, and review with explicit phase gates.
---

# Auto Execute

> **Cursor host note.** OMC's `autopilot` skill chains analyst, architect,
> executor, security-reviewer, and code-reviewer sub-agents through hooks.
> Cursor's checked-in skill model does not document an equivalent
> repo-checked-in sub-agent primitive, so this adaptation runs the same five
> phases as **explicit, sequential skill invocations** that the Cursor agent
> performs in one workspace. Each phase is a real, reproducible artifact
> (spec, plan, code, test output, review report); there is no hidden hook
> magic.

## Use when

- The user said "autopilot", "auto execute", "build me", "make me", "handle
  it all".
- The task spans multiple phases (requirements -> plan -> code -> test ->
  review) and the user wants a hands-off run.
- The user is willing to let the loop run to completion before reviewing.

## Skip when

- The user wants a single focused fix - delegate directly.
- The user wants to brainstorm or compare options - use `plan`.
- The user already has a spec and just wants implementation - go straight to
  `iterate-loop`.

## Pipeline (5 phases)

| Phase | Skill it invokes | Output artifact |
|-------|------------------|-----------------|
| 0. Expand | `deep-interview` (only if input is vague) | `docs/specs/<slug>.md` |
| 1. Plan | `plan` (direct mode if a spec exists) | `docs/plans/<slug>.md` |
| 2. Execute | `iterate-loop` against the plan | code changes + `prd.json` |
| 3. QA | run build, lint, typecheck, tests | fresh terminal output |
| 4. Review | `review` + `security-review` (if relevant) | review reports |

Each phase must complete before the next begins.

## Workflow

1. **Decide whether Phase 0 is needed.** If the request has file paths,
   function names, or concrete acceptance criteria, skip Phase 0 and go to
   Phase 1. Otherwise invoke `deep-interview`.
2. **Phase 1 - Plan.** Invoke `plan`. Confirm the plan with the user once
   (one chance to course-correct). If the user disapproves, return to
   Phase 0 or Phase 1 with feedback.
3. **Phase 2 - Execute.** Invoke `iterate-loop` with the plan as the task
   input. The loop drives `prd.json` to all-passing.
4. **Phase 3 - QA.** Run the project's full verification suite (build,
   lint, typecheck, tests). If anything fails, fix and re-run. Cap at
   five QA cycles; if the same error recurs three times, stop and surface
   it.
5. **Phase 4 - Review.** Invoke `review`. If the change touches auth, input
   handling, secrets, or external requests, also invoke `security-review`.
   Treat any `REQUEST CHANGES` verdict as a regression: fix, re-QA,
   re-review. Cap at three review rounds.
6. **Stop.** Report:
   - the spec, plan, and PRD paths,
   - the final test/build output,
   - the review verdicts, and
   - a short summary of what was built.

## Caps and stop conditions

- QA cycles: max 5.
- Same QA error three times in a row -> stop, surface as fundamental issue.
- Review rounds: max 3 per reviewer.
- User says "stop", "cancel", or "abort" -> stop immediately, leave the
  workspace in its current state, do not roll back.
- If a phase produces no artifact (e.g. plan was empty), do not advance;
  surface the gap and ask.

## Anti-patterns

- Skipping Phase 1 to "save time" on a non-trivial change.
- Marking Phase 4 complete with "looks good" instead of running the
  reviewer skills.
- Reducing scope to make Phase 3 pass.
- Auto-merging or auto-committing - this skill never commits without
  explicit user confirmation.

## Boundaries

- This skill does not promise resume after the chat ends. If the user
  closes the session mid-pipeline, they re-open and say "continue
  auto-execute"; the next turn reads the latest spec/plan/PRD on disk and
  resumes from the first incomplete phase.
- It does not invoke external models, MCP servers, or background daemons.
  All work happens through the Cursor agent in the current workspace.
- It does not claim parity with Claude Code's `autopilot`. The OMC version
  uses runtime hooks and a Task primitive that Cursor does not document as
  repo-owned today; this version is a faithful, smaller pipeline that
  works with Cursor's documented surfaces only.
- It does not automatically deploy, push, or publish anything. Final
  delivery (commit, PR, deploy) stays with the user.
