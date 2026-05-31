---
name: auto-execute
description: "[OMCS] Autonomous preset that runs the phase-controller state machine to completion - intake, research, plan, execute, verify, review - with explicit phase gates."
---

# Auto Execute

> **Cursor host note.** This is a thin autonomous **preset** over `phase-controller`. It does not define a parallel pipeline or its own state file: it drives the repo's single workflow-state contract (`.cursor/state/workflow-state.json`) through the `phase-controller` state machine to completion, with explicit phase gates and checked-in evidence rather than hidden runtime assumptions. Each phase produces reproducible evidence: spec, plan, code, test output, and review report.

## Governance

### Ownership Class
- **repo-owned**: YES — Checked in at `skills/auto-execute/SKILL.md` as an autonomous preset over `phase-controller`.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: NO — Cursor does not document an autonomous orchestration preset; this is repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/auto-execute/SKILL.md`, `skills/phase-controller/SKILL.md`, `.cursor/state/workflow-state.schema.json`, the phase gates, and output artifacts.
- **runtime-smoke**: YES (optional) — When `cursor-state-bridge` MCP is installed, bridge tools provide runtime proof; state tracking uses the single `.cursor/state/workflow-state.json` contract.

### Claim Summary
This skill is the autonomous preset for the repo's orchestration root. It runs the `phase-controller` state machine to completion — intake → research → plan → execute → verify → review → done — with explicit phase gates. Each phase produces reproducible evidence: spec, plan, code, test output, and review report. State lives in the single `.cursor/state/workflow-state.json` contract; the MCP bridge is optional and is the only agent-callable path to write it.

## MCP Integration Points

| Tool/Resource | MCP Server | Purpose | Required | Status |
|---|---|---|---|---|
| `state_init` | cursor-state-bridge | Initialize workflow-state for the run | No | optional |
| `state_set_phase` | cursor-state-bridge | Advance between phases | No | optional |
| `state_update_acceptance_criterion` | cursor-state-bridge | Record verified criterion evidence | No | optional |
| `state_record_failure` | cursor-state-bridge | Record phase or QA failure before escalation | No | optional |

**Note**: MCP bridge is opt-in. State tracking uses the single `.cursor/state/workflow-state.json` contract (the same document `phase-controller`, `iterate-loop`, the hooks, and the validators read). When the bridge is available, these are the only MCP tools this preset should ask the orchestrator to call; never hand-edit `workflow-state.json`.

## Hooks Dependencies

No hooks dependencies. This skill drives `phase-controller` and runs verification commands in the workspace.

## Orchestration Role

- **Lifecycle phase(s)**: all (intake → research → plan → execute → verify → review → done) — delegated to `phase-controller`
- **Invoked by**: User (keyword: 'autopilot', 'auto execute', 'build me', 'make me', 'handle it all')
- **Invokes**: `phase-controller` (the orchestration root), which in turn routes `deep-interview`, `plan`, `iterate-loop`, `review`, `security-review`, and `remember` per phase
- **State contract**: Reads/writes the single `.cursor/state/workflow-state.json` contract via the `cursor-state-bridge` MCP tools (through `phase-controller`)
- **Failure handling**: Caps QA cycles at 5; if same error recurs 3 times, stops and surfaces it via `state_record_failure`

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

## How it works

This preset does not implement its own pipeline. It hands control to
`phase-controller` (see [`skills/phase-controller/SKILL.md`](../phase-controller/SKILL.md)),
the orchestration root, and runs its state machine autonomously to
completion. The phases below map one-to-one onto the `phase-controller`
state machine and its single `.cursor/state/workflow-state.json` contract:

| phase-controller phase | Skill it routes to | Output artifact |
|------------------------|--------------------|-----------------|
| intake / research | `deep-interview` (only if input is vague) | `docs/specs/<slug>.md` |
| plan | `plan` (direct mode if a spec exists) | `docs/plans/<slug>.md` |
| execute | `iterate-loop` against the plan | code changes recorded in `.cursor/state/workflow-state.json` |
| verify | build, lint, typecheck, tests | fresh terminal output |
| review | `review` + `security-review` (if relevant) | review reports |

Each phase gate must complete before the next begins.

## Workflow

1. **Enter `phase-controller`.** Call `state_init` (cursor-state-bridge) to
   create the run's `.cursor/state/workflow-state.json` with the task and an
   initial acceptance-criteria list, then let `phase-controller` detect the
   phase and route the next step. If the bridge is unavailable, report the
   structured init for the user or host to apply. Run autonomously: do not
   pause between phases except for the single plan confirmation in step 2.
2. **Intake → research → plan.** Skip the `deep-interview` detour if the
   request already has file paths, function names, or concrete acceptance
   criteria. At the `plan` phase, confirm the plan with the user once (one
   chance to course-correct); if the user disapproves, return to intake/plan
   with feedback. Advance phases via `state_set_phase`.
3. **Execute.** `phase-controller` invokes `iterate-loop`, which drives the
   workflow-state acceptance criteria to all-`passed`.
4. **Verify.** Run the project's full verification suite (build, lint,
   typecheck, tests). If anything fails, fix and re-run. Cap at five QA
   cycles; if the same error recurs three times, stop and surface it via
   `state_record_failure`.
5. **Review.** `phase-controller` invokes the `review` skill, `critic`
   agent, and `code-reviewer` agent. If the change touches auth, input
   handling, secrets, or external requests, also invoke `security-review`.
   Map each reviewer's raw verdict to the shared loop gate (see
   `skills/iterate-loop/SKILL.md` step 7): `APPROVE` / `passed` =>
   `pass`, `COMMENT` / `comment` => `comment`, `REQUEST CHANGES` /
   `needs_changes` / `blocking` => `block`. Any `block` is a regression: fix, re-verify,
   re-review. Cap at three review rounds. When the run produced durable
   project knowledge, invoke `skills/remember/SKILL.md` once to route
   findings to notepad, project memory, decisions, or wiki (never hooks).
6. **Done.** Set the workflow-state phase to `done` and report:
   - the spec and plan paths,
   - the final acceptance-criteria status from `.cursor/state/workflow-state.json`,
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

## State writes (via cursor-state-bridge MCP)

Because this preset drives `phase-controller`, every phase transition is
persisted to the single `.cursor/state/workflow-state.json` contract through
the `cursor-state-bridge` MCP tools, so resume after a session restart (or a
`cursor-agent --resume`) reads the current position from the same document:

- `state_init` at the start of the run to record the task and acceptance
  criteria.
- `state_set_phase` at each phase boundary (`intake` -> `research` ->
  `plan` -> `execute` -> `verify` -> `review` -> `done`).
- `state_update_acceptance_criterion` whenever a criterion passes verification.
- `state_record_failure` if a phase fails and the run must escalate.

The bridge serialises every write through a shared `file_lock`; never edit
`workflow-state.json` directly. When the bridge is not installed, report the
structured update for the user or host to apply.

## Boundaries

- Resume after the chat ends is handled by `phase-controller`, not a
  separate auto-execute state. If the user closes the session mid-run, they
  re-open and re-enter through `phase-controller` (or say "continue
  auto-execute"); the next turn rereads `.cursor/state/workflow-state.json`
  and resumes from the first incomplete phase.
- It does not invoke external models, MCP servers, or background daemons.
  All work happens through the Cursor agent in the current workspace.
- It does not claim hidden orchestration. The workflow is explicit, sequential,
  and bounded to Cursor surfaces this repo documents and validates.
- It does not automatically deploy, push, or publish anything. Final
  delivery (commit, PR, deploy) stays with the user.
