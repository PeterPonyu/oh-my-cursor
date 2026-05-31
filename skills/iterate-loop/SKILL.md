---
name: iterate-loop
description: "[OMCS] Persistence pattern - iterate against the workflow-state acceptance criteria until every one is verified, with a reviewer pass before stopping."
---

# Iterate Loop

> **Cursor host note.** This is a self-developed explicit persistence pattern for Cursor workspaces. Persistence comes from the shared workflow-state document (`.cursor/state/workflow-state.json`) and fresh verification evidence, not from implicit continuation. This skill is the execute/verify/review loop primitive that `phase-controller` invokes during its `execute` phase; project hooks may remind the user to verify completion, but this skill remains a disciplined loop rather than a daemon.

## Governance

### Ownership Class
- **repo-owned**: YES — Checked in at `skills/iterate-loop/SKILL.md` as a persistence pattern for Cursor workspaces.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: NO — Cursor does not document a persistence primitive; this is repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/iterate-loop/SKILL.md`, `.cursor/state/workflow-state.schema.json`, `scripts/validate-workflow-state.ts`.
- **runtime-smoke**: YES (optional) — When `cursor-state-bridge` MCP is installed, bridge tools provide runtime proof; default reads/writes `.cursor/state/workflow-state.json` through the documented validator.

### Claim Summary
This skill provides a persistence pattern that iterates against the workflow-state acceptance criteria until every one is verified. The state document is the repo's single workflow-state contract at `.cursor/state/workflow-state.json` (validated against `.cursor/state/workflow-state.schema.json`); verification evidence is recorded through the `cursor-state-bridge` MCP tools. Each acceptance criterion is verified before marking it `passed`, and a reviewer pass is required before stopping.

## MCP Integration Points

| Tool/Resource | MCP Server | Purpose | Required | Status |
|---|---|---|---|---|
| `state_read` | cursor-state-bridge | Read current acceptance criteria and phase | No | optional |
| `state_update_acceptance_criterion` | cursor-state-bridge | Record criterion pass/fail with evidence | No | optional |
| `state_record_failure` | cursor-state-bridge | Record criterion failure for loop control | No | optional |
| `state_history_append` | cursor-state-bridge | Append verification notes | No | optional |

**Note**: MCP bridge is opt-in. The state contract is `.cursor/state/workflow-state.json` (the same document `phase-controller`, the hooks, and the validators read). When the bridge is not installed, read the document via `state_read`/the validator and report the next structured update the user or host should apply; never hand-edit `workflow-state.json`.

## Hooks Dependencies

No hooks dependencies. This skill reads `.cursor/state/workflow-state.json` and runs verification commands in the workspace.

## Orchestration Role

- **Lifecycle phase(s)**: execute, verify, review
- **Invoked by**: `phase-controller` (execute phase), `auto-execute` (which drives phase-controller), user directly
- **Invokes**: `review` skill for reviewer pass (step 7); optionally `security-review` if change touches auth/secrets
- **State contract**: Reads/writes `.cursor/state/workflow-state.json` (the single workflow-state contract) through the `cursor-state-bridge` MCP tools
- **Failure handling**: If a criterion fails, it stays `status: failed`/`pending` and the loop continues to the next criterion

## Use when

- The user said "do not stop", "must complete", "keep going until done".
- The task has multiple verifiable acceptance criteria that should each be checked.
- You want a reviewer sign-off before declaring victory.

## Skip when

- The user wants a one-shot fix - just do it.
- The user wants exploration or planning - use `plan` or `deep-interview`.
- There is no way to verify completion (no tests, no command, no checkable
  artifact); fix that first.

## State shape

This skill operates on the single workflow-state contract at
`.cursor/state/workflow-state.json`, validated against
[`.cursor/state/workflow-state.schema.json`](../../.cursor/state/workflow-state.schema.json).
This is the same document `phase-controller`, the hooks (`stop-gate.ts`,
`compact-reminder.ts`, `state-watcher.ts`), and `scripts/validate-workflow-state.ts`
read; there is no separate per-skill state file. The loop iterates over the
`acceptance_criteria` array, where each criterion has the shape:

```json
{
  "id": "AC-001",
  "criterion": "<concrete, testable criterion naming a file, command, or behavior>",
  "status": "pending",
  "evidence": ""
}
```

Per-criterion `status` is one of `pending | passed | failed | skipped`.
Generic criteria like "implementation complete" are forbidden. Replace them
with criteria that name a file, a command, or an observable behavior.

## Workflow (explicit per turn)

1. **Initialize.** If no workflow-state document exists for the task, call
   `state_init` (cursor-state-bridge) with the task and an initial
   acceptance-criteria list, and ask the user to confirm. Refine generic
   criteria into specific ones. If the bridge is unavailable, report the
   structured init for the user or host to apply.
2. **Pick the next criterion** with `status: pending` (or `failed`),
   highest priority first.
3. **Implement.** Make the smallest viable change. Run the affected build,
   tests, lint, and typecheck. Read the actual output; do not assume.
4. **Verify the acceptance criterion.** Paste fresh evidence (command +
   output snippet) into the chat. If it fails, the criterion stays
   `status: failed`/`pending`.
5. **Mark the criterion `status: passed`** only when its evidence is
   captured, via `state_update_acceptance_criterion` (passing the
   `evidence` reference). Never hand-edit `workflow-state.json`.
6. **Loop back to step 2** until every criterion is `status: passed`.
7. **Reviewer pass.** Run the `review` skill, `critic` agent, `code-reviewer` agent (and `security-review` if the
   change touches auth, input handling, or secrets). Map each reviewer's raw
   verdict to the shared loop gate before deciding to stop:

   | Reviewer | Raw verdict | Loop gate |
   | --- | --- | --- |
   | `review` | `APPROVE` | `pass` |
   | `review` | `COMMENT` | `comment` |
   | `review` | `REQUEST CHANGES` | `block` |
   | `code-reviewer` | `changes_requested: false` (or `verdict: "passed"`) | `pass` |
   | `code-reviewer` | `severity: "comment"` | `comment` |
   | `code-reviewer` | `severity: "blocking"` / `verdict: "changes_requested"` | `block` |
   | `critic` | `severity: "blocking"` | `block` |
   | `security-review` | `APPROVE` | `pass` |
   | `security-review` | `COMMENT` | `comment` |
   | `security-review` | `REQUEST CHANGES` | `block` |

   Any `block` is a regression: fix and re-verify, do not override. A `comment`
   is recorded but does not block progression. Stop when **every reviewer that
   ran returned `pass` or `comment`** under this mapping.
8. **Stop.** Report the final acceptance-criteria status from
   `.cursor/state/workflow-state.json`, the verification commands used, and
   the reviewer verdicts (raw and mapped).

## Anti-patterns

- "Tests pass" without showing the command output.
- "Should work" - banned word in this skill.
- Marking a criterion complete because the implementation looks right.
- Deleting tests to make them pass.
- Hand-waving the reviewer pass ("looks good to me").
- Reducing scope to declare victory.

## State writes (via cursor-state-bridge MCP)

All loop progress is recorded against `.cursor/state/workflow-state.json`
through the `cursor-state-bridge` MCP tools so `phase-controller`, the
verifier, and `stop-gate.ts` read a consistent contract:

- `state_update_acceptance_criterion` when a criterion flips to
  `status: passed`, passing the supporting `evidence` reference (file path or
  command output snippet).
- `state_history_append` to log a one-line note per loop iteration when
  evidence is worth retaining.
- `state_record_failure` after the third recurring failure, before stopping.

The bridge serialises every write through a shared `file_lock`; never edit
`workflow-state.json` directly. When the bridge is not installed, read with
`state_read` / `scripts/validate-workflow-state.ts` and report the structured
update for the user or host to apply.

## Background commands

For long-running checks (full test suites, builds, installs), run them in the
terminal as background jobs and check back. For short checks (lint, single
test file, typecheck), run them in the foreground. Do not pretend a command
is finished before its output exists.

## Boundaries

- This skill is **explicit**. It does not auto-resume after the chat ends.
  If the user closes the session, they must reopen it and say "continue
  iterate-loop" (or re-enter through `phase-controller`); the next turn
  rereads `.cursor/state/workflow-state.json` and picks up.
- It does not promise parallel execution. Use `parallel-batch` for that.
- It does not require MCP tools or background daemons. Project hooks may provide
  conservative reminders, but loop progress is still driven by explicit
  verification and workflow-state updates.
- The reviewer pass is a separate skill invocation, not a sub-agent. Run
  `review` (and optionally `security-review`) in a follow-up turn.

## Stop conditions

- Every acceptance criterion has `status: passed`, every reviewer that ran
  maps to `pass` or `comment` under the shared loop gate above (see Workflow
  step 7), fresh test/build evidence is in the chat.
- The user says "stop", "cancel", or "abort".
- The same failure recurs three iterations in a row - stop and report it as
  a fundamental issue rather than retrying indefinitely.
