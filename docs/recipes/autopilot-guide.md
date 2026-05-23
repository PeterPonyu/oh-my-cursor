# Context Recipe Library: Bounded Autopilot & Consensus Gate

This guide explains how to use the **Bounded Autopilot** runner (`run-autopilot.ts`) and **Consensus Planning Gate** (`consensus-gate.ts`) to automate workspace execution pipelines safely.

---

## 1. Consensus Planning Gate (ralplan)

To prevent agents from executing code before a plan has been properly reviewed, the Consensus Planning Gate (ralplan) blocks phase transitions from `plan` to `execute` until all three core planning checkpoints are met:

1. **Planner Proposal**: The `planner` agent has drafted the task list and checklist.
2. **Critic Audit**: The `critic` agent has challenged the approach.
3. **Verifier Check**: The `verifier` agent has verified the checklist verification commands.

These checkpoints are verified by scanning the `history` array in your `workflow-state.json`.

### Manual Audit Command
You can run the audit manually at any time:
```bash
node --experimental-strip-types scripts/consensus-gate.ts --state .cursor/state/workflow-state.json
```

---

## 2. Bounded Autopilot Loop

The Autopilot runner drives the development lifecycle sequentially through your task checklist:
- Spawns specialized agents to run tasks.
- Executes verification commands automatically after each task.
- Validates the Consensus Gate when transitioning from planning to execution.

### Running Autopilot
Start the autopilot loop from the repository root:
```bash
node --experimental-strip-types scripts/run-autopilot.ts
```

### Configurable Step Limit
To prevent runaway billing or execution loops, Autopilot limits the number of sequential agent steps per run (default: 5). You can override this limit:

- **Via CLI flag**:
  ```bash
  node --experimental-strip-types scripts/run-autopilot.ts --step-limit 10
  ```
- **Via environment variable**:
  ```bash
  export OH_MY_CURSOR_STEP_LIMIT=3
  node --experimental-strip-types scripts/run-autopilot.ts
  ```

---

## 3. Immediate Cancellation

If you need to halt the Autopilot loop immediately, you can use either of the following methods:

1. **SIGINT (Keyboard Interrupt)**:
   Press `Ctrl+C` in the running terminal. The loop will intercept the signal, update the workflow state note, and cleanly suspend.
2. **File-based Cancel Token**:
   Create an empty file at `.omcs/cancel`. The Autopilot runner checks for this token before each step, deletes it, and exits cleanly:
   ```bash
   mkdir -p .omcs && touch .omcs/cancel
   ```
