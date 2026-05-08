---
name: iterate-loop
description: Persistence pattern - iterate against a small PRD until every acceptance criterion is verified, with a reviewer pass before stopping.
---

# Iterate Loop

> **Cursor host note.** This is a self-developed explicit persistence pattern
> for Cursor workspaces. Persistence comes from a small `prd.json` checked into
> the workspace and fresh verification evidence, not from implicit continuation.
> Project hooks may remind the user to verify completion, but this skill remains
> a disciplined loop rather than a daemon.

## Use when

- The user said "do not stop", "must complete", "keep going until done".
- The task has multiple verifiable stories that should each be checked.
- You want a reviewer sign-off before declaring victory.

## Skip when

- The user wants a one-shot fix - just do it.
- The user wants exploration or planning - use `plan` or `deep-interview`.
- There is no way to verify completion (no tests, no command, no checkable
  artifact); fix that first.

## PRD shape

Create `prd.json` at the workspace root (`./prd.json`). This is the canonical
location every step in this skill (and `auto-execute`) reads from. Other
locations are not supported by the resume path:

```json
{
  "task": "<original user request>",
  "stories": [
    {
      "id": "US-001",
      "title": "<short>",
      "acceptanceCriteria": [
        "<concrete, testable criterion>",
        "<concrete, testable criterion>"
      ],
      "passes": false
    }
  ]
}
```

Generic criteria like "implementation complete" are forbidden. Replace them
with criteria that name a file, a command, or an observable behavior.

## Workflow (explicit per turn)

1. **Initialize.** If no `prd.json` exists, draft one from the user's task
   and ask the user to confirm. Refine generic criteria into specific ones.
2. **Pick the next story** with `passes: false`, highest priority first.
3. **Implement.** Make the smallest viable change. Run the affected build,
   tests, lint, and typecheck. Read the actual output; do not assume.
4. **Verify each acceptance criterion.** For each criterion, paste fresh
   evidence (command + output snippet) into the chat. If any criterion
   fails, the story stays `passes: false`.
5. **Mark the story `passes: true`** only when every criterion is verified.
   Update `prd.json` on disk.
6. **Loop back to step 2** until every story is `passes: true`.
7. **Reviewer pass.** Run the `review` skill (and `security-review` if the
   change touches auth, input handling, or secrets). Map each reviewer's raw
   verdict to the shared loop gate before deciding to stop:

   | Reviewer | Raw verdict | Loop gate |
   | --- | --- | --- |
   | `review` | `APPROVE` | `pass` |
   | `review` | `COMMENT` | `comment` |
   | `review` | `REQUEST CHANGES` | `block` |
   | `security-review` | `SAFE TO MERGE` | `pass` |
   | `security-review` | `FIX HIGH+ FIRST` | `comment` |
   | `security-review` | `DO NOT DEPLOY` | `block` |

   Any `block` is a regression: fix and re-verify, do not override. A `comment`
   is recorded but does not block progression. Stop when **every reviewer that
   ran returned `pass` or `comment`** under this mapping.
8. **Stop.** Report the final state of `prd.json`, the verification commands
   used, and the reviewer verdicts (raw and mapped).

## Anti-patterns

- "Tests pass" without showing the command output.
- "Should work" - banned word in this skill.
- Marking a story complete because the implementation looks right.
- Deleting tests to make them pass.
- Hand-waving the reviewer pass ("looks good to me").
- Reducing scope to declare victory.

## State sync (optional, via cursor-state-bridge MCP)

When a workflow-state document is in scope, mirror PRD progress to
`.cursor/state/workflow-state.json` through the `cursor-state-bridge` MCP
tools so verifiers and `stop-gate.py` can read it:

- `state_update_acceptance_criterion` when a story flips to `passes: true`,
  passing the supporting `evidence` reference (file path or command output
  snippet).
- `state_history_append` to log a one-line note per loop iteration when
  evidence is worth retaining.
- `state_record_failure` after the third recurring failure, before stopping.

The bridge serialises every write through a shared `file_lock`; never edit
`workflow-state.json` directly.

## Background commands

For long-running checks (full test suites, builds, installs), run them in the
terminal as background jobs and check back. For short checks (lint, single
test file, typecheck), run them in the foreground. Do not pretend a command
is finished before its output exists.

## Boundaries

- This skill is **explicit**. It does not auto-resume after the chat ends.
  If the user closes the session, they must reopen it and say "continue
  iterate-loop"; the next turn rereads `prd.json` and picks up.
- It does not promise parallel execution. Use `parallel-batch` for that.
- It does not require MCP tools or background daemons. Project hooks may provide
  conservative reminders, but loop progress is still driven by explicit
  verification and PRD updates.
- The reviewer pass is a separate skill invocation, not a sub-agent. Run
  `review` (and optionally `security-review`) in a follow-up turn.

## Stop conditions

- Every story has `passes: true`, every reviewer that ran maps to `pass` or
  `comment` under the shared loop gate above (see Workflow step 7), fresh
  test/build evidence is in the chat.
- The user says "stop", "cancel", or "abort".
- The same failure recurs three iterations in a row - stop and report it as
  a fundamental issue rather than retrying indefinitely.
