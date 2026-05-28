# Workflow-State Lifecycle Example

This recipe is a copy-pasteable, repo-owned example of the workflow-state
loop: intake → plan → execute → verify → review → done.

Ownership class: **repo-owned**. Proof class: **checked-in-artifact**.
The commands below call the checked-in CLI at
`src/oh_my_cursor/workflow_state/cli.ts` and write only a local
`.cursor/state/workflow-state.json` file.

## Start from a clean local state file

```bash
rm -f .cursor/state/workflow-state.json
```

## 1. Intake: initialize the task

```bash
node --experimental-strip-types src/oh_my_cursor/workflow_state/cli.ts \
  init .cursor/state/workflow-state.json \
  --task-id demo-lifecycle \
  --title "Demo workflow-state lifecycle" \
  --phase intake \
  --status pending \
  --role orchestrator \
  --next-action "define acceptance criteria"
```

## 2. Plan: add acceptance criteria

```bash
node --experimental-strip-types src/oh_my_cursor/workflow_state/cli.ts \
  set .cursor/state/workflow-state.json \
  --phase plan \
  --status in_progress \
  --role planner \
  --next-action "write acceptance criteria" \
  --note "Moved from intake to planning."

node --experimental-strip-types src/oh_my_cursor/workflow_state/cli.ts \
  ac .cursor/state/workflow-state.json \
  --id AC1 \
  --criterion "A runnable command demonstrates the lifecycle" \
  --status pending

node --experimental-strip-types src/oh_my_cursor/workflow_state/cli.ts \
  ac .cursor/state/workflow-state.json \
  --id AC2 \
  --criterion "Verification evidence is recorded before done" \
  --status pending
```

## 3. Execute: perform the scoped work

```bash
node --experimental-strip-types src/oh_my_cursor/workflow_state/cli.ts \
  set .cursor/state/workflow-state.json \
  --phase execute \
  --status in_progress \
  --role implementer \
  --next-action "run verification command" \
  --note "Acceptance criteria are ready; executing the example."
```

## 4. Verify: mark acceptance criteria with evidence

```bash
node --experimental-strip-types src/oh_my_cursor/workflow_state/cli.ts \
  set .cursor/state/workflow-state.json \
  --phase verify \
  --status in_progress \
  --role verifier \
  --next-action "record criterion evidence"

node --experimental-strip-types src/oh_my_cursor/workflow_state/cli.ts \
  ac .cursor/state/workflow-state.json \
  --id AC1 \
  --status passed \
  --evidence "CLI init/set/ac commands completed without errors"

node --experimental-strip-types src/oh_my_cursor/workflow_state/cli.ts \
  ac .cursor/state/workflow-state.json \
  --id AC2 \
  --status passed \
  --evidence "workflow-state.json contains passed AC1 and AC2 entries"
```

## 5. Review and close

```bash
node --experimental-strip-types src/oh_my_cursor/workflow_state/cli.ts \
  set .cursor/state/workflow-state.json \
  --phase review \
  --status in_progress \
  --role code-reviewer \
  --next-action "confirm no pending criteria" \
  --note "Reviewing recorded evidence."

node --experimental-strip-types src/oh_my_cursor/workflow_state/cli.ts \
  set .cursor/state/workflow-state.json \
  --phase done \
  --status passed \
  --role verifier \
  --next-action "archive session" \
  --note "All criteria passed with evidence."
```

When the phase moves to `done`, the API archives a copy under
`.cursor/state/sessions/`. Keep `.cursor/state/workflow-state.json` and the
archive as local runtime artifacts; do not commit them.
