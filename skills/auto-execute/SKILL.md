---
name: auto-execute
description: "[OMCS] Autonomous execution pipeline - expand idea, plan, implement, QA, and review with explicit phase gates."
---

# Auto Execute

> **Cursor host note.** This is a self-developed five-phase execution pipeline for Cursor workspaces. It uses explicit phase gates and checked-in artifacts rather than hidden runtime assumptions. Each phase produces reproducible evidence: spec, plan, code, test output, and review report.

## Governance

### Ownership Class
- **repo-owned**: YES — Checked in at `skills/auto-execute/SKILL.md` as a five-phase autonomous execution pipeline.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: NO — Cursor does not document a five-phase pipeline; this is repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/auto-execute/SKILL.md`, five-phase pipeline, phase gates, output artifacts.
- **runtime-smoke**: YES (optional) — When `cursor-state-bridge` MCP is installed, bridge tools provide runtime proof for state tracking; default uses `prd.json` file.

### Claim Summary
This skill is a self-developed five-phase execution pipeline that expands idea, plans, implements, QAs, and reviews with explicit phase gates. Each phase produces reproducible evidence: spec, plan, code, test output, and review report. MCP bridge is optional for state tracking; default uses `prd.json` file.

## MCP Integration Points

| Tool/Resource | MCP Server | Purpose | Required | Status |
|---|---|---|---|---|
| `state_init` | cursor-state-bridge | Initialize workflow-state for the run | No | optional |
| `state_set_phase` | cursor-state-bridge | Advance between phases | No | optional |

**Note**: MCP bridge is opt-in. Default uses `prd.json` file at workspace root.

## Hooks Dependencies

No hooks dependencies. This skill orchestrates other skills and runs verification commands in the workspace.

## Orchestration Role

- **Lifecycle phase(s)**: all (intake → research → plan → execute → verify → review → done)
- **Invoked by**: User (keyword: 'autopilot', 'auto execute', 'build me', 'make me', 'handle it all')
- **Invokes**: `deep-interview`, `plan`, `iterate-loop`, `review`, `security-review`
- **State contract**: Reads/writes `prd.json` at workspace root; optionally updates workflow-state via MCP bridge
- **Failure handling**: Caps QA cycles at 5; if same error recurs 3 times, stops and surfaces it

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
| 2. Execute | `iterate-loop` against the plan | code changes + `./prd.json` (workspace root) |
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
5. **Phase 4 - Review.** Invoke `review` skill, `critic` agent, and `code-reviewer` agent. If the change touches auth, input
   handling, secrets, or external requests, also invoke `security-review`.
   Map each reviewer's raw verdict to the shared loop gate (see
   `skills/iterate-loop/SKILL.md` step 7): `APPROVE` / `passed` =>
   `pass`, `COMMENT` / `comment` => `comment`, `REQUEST CHANGES` /
   `needs_changes` / `blocking` => `block`. Any `block` is a regression: fix, re-QA,
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

## State sync (optional, via cursor-state-bridge MCP)

When a `task_id` is in scope, persist phase transitions through the
`cursor-state-bridge` MCP tools so resume after a session restart can read
the current position from `.cursor/state/workflow-state.json`:

- `state_init` at the start of Phase 1 to record the task and acceptance
  criteria.
- `state_set_phase` at each phase boundary (`research` -> `plan` ->
  `execute` -> `verify` -> `review` -> `done`).
- `state_update_acceptance_criterion` whenever a story passes verification.
- `state_record_failure` if a phase fails and the run must escalate.

The bridge serialises every write through a shared `file_lock`; never edit
`workflow-state.json` directly.

## Boundaries

- This skill does not promise resume after the chat ends. If the user
  closes the session mid-pipeline, they re-open and say "continue
  auto-execute"; the next turn reads the latest spec/plan/PRD on disk and
  resumes from the first incomplete phase.
- It does not invoke external models, MCP servers, or background daemons.
  All work happens through the Cursor agent in the current workspace.
- It does not claim hidden orchestration. The workflow is explicit, sequential,
  and bounded to Cursor surfaces this repo documents and validates.
- It does not automatically deploy, push, or publish anything. Final
  delivery (commit, PR, deploy) stays with the user.
