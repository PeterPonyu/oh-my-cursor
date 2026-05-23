---
name: team-controller
description: "[OMCS] Multi-agent team coordinator that launches concurrent specialized agents on independent tasks."
---

# Team Controller

This skill enables the orchestration of concurrent agent execution lanes across independent tasks. It acts as the "Team Mode" automation layer, coordinating multiple background `cursor-agent` processes.

## Governance

### Ownership Class
- **repo-owned**: YES — Checked in at `skills/team-controller/SKILL.md`.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: NO
- **checked-in-artifact**: YES — Verified by scripts and validators.
- **runtime-smoke**: YES — Proven by E2E test runs.

---

## Execution Flow

1. **Intake & Scoping**:
   - Locate the target `workflow-state.json` (either from `--state` parameter, `OH_MY_CURSOR_WORKFLOW_STATE` environment variable, or the default `.cursor/state/workflow-state.json`).
   - Parse the active state and extract the checklist `tasks` (specifically looking for `status: "pending"` or `status: "claimed"`).

2. **Wave Selection**:
   - Filter tasks belonging to the current execution wave (as defined in the plan) that have no unresolved dependencies.

3. **Spawn Parallel Agents**:
   - Run the team coordinator script:
     ```bash
     node --experimental-strip-types scripts/run-team-coordinator.ts [options]
     ```
   - For each active task, the coordinator spawns a background `cursor-agent` with:
     - Prompt detailing the task criteria.
     - Role configuration matching the task's assigned agent.
     - Local redirection to `.cursor-agent-logs/task-<id>.log`.

4. **Monitor and Track**:
   - Dynamically update the task's status from `pending` to `in_progress` in the state file.
   - Upon completion of a lane, update the status to `completed` and record the result evidence.

5. **Failure Recovery**:
   - If any task fails, halt further concurrency waves, report the failure log segment, and revert the state phase to `blocked`.

## Orchestration Role

- **Lifecycle phase(s)**: execute, verify
- **Invoked by**: User or phase-controller
- **Invokes**: Spawns multiple concurrent `cursor-agent` processes for independent tasks
- **State contract**: Reads and updates `tasks` status inside the active `workflow-state.json` file.

## MCP Integration Points

No direct MCP integration. The coordinator updates the task status directly using filesystem operations and file locking.

