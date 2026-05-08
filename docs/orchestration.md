# Plugin orchestration

This is the orchestration-first entry point for `oh-my-cursor`. It explains how
the plugin's hooks, skills, agents, and state work together as one coordinated
lifecycle, and where each surface stops being repo-owned.

## Why orchestration-first

`oh-my-cursor` is a Cursor-native workflow backbone. It already ships:

- a repo-root plugin manifest at `.cursor-plugin/plugin.json`;
- project hooks at `.cursor/hooks.json` plus stdlib-only Python scripts;
- project agents in `.cursor/agents/`;
- plugin-owned rules in `rules/`;
- plugin-owned skills in `skills/`; and
- bounded validators and benchmark artifacts.

What was missing was a single coordination contract that lets those surfaces
share a view of the current task. This document is that contract.

For cross-ecosystem alignment with `oh-my-claudecode`, see the
[`Claude Code bridge`](./claudecode-bridge.md) and
[`Claude Code parity matrix`](./claudecode-parity-matrix.md). Those documents
map concepts without changing this repo's Cursor-owned state or proof
boundaries.

## Lifecycle at a glance

```text
intake → research → plan → execute → verify → review → done
                                              ↘ blocked
```

Phases are explicit. There is no background daemon and no hidden retry loop.
Each phase advance is an action on a checked-in JSON document that follows
[`.cursor/state/workflow-state.schema.json`](../.cursor/state/workflow-state.schema.json).

## Repo-owned surfaces in the lifecycle

| Surface | File(s) | Role in the lifecycle |
| --- | --- | --- |
| Plugin manifest | `.cursor-plugin/plugin.json` | Declares the repo-root plugin and points Cursor at the rules, skills, agents, and hooks payload. |
| Hooks | `.cursor/hooks.json` plus stdlib-only Python scripts under `.cursor/hooks/` | Fourteen documented Cursor hook events are wired (`sessionStart` → `session-bootstrap.py`; `sessionEnd` → `session-summary.py`; `beforeSubmitPrompt` → `prompt-router.py`; `preToolUse` → `tool-guard.py`; `postToolUse` → `state-watcher.py`; `postToolUseFailure` → `failure-router.py`; `subagentStart` → `subagent-bootstrap.py`; `subagentStop` → `subagent-summary.py`; `beforeShellExecution` → `shell-guard.py`; `afterShellExecution` → `shell-debrief.py`; `beforeReadFile` → `read-advisor.py`; `afterFileEdit` → `claim-guard.py`; `preCompact` → `compact-reminder.py`; `stop` → `stop-gate.py`). All scripts are fail-open, observational unless a tightly bounded severe pattern is detected, and **read** workflow-state — they never write it. |
| Agents | `.cursor/agents/orchestrator.md`, `researcher.md`, `planner.md`, `verifier.md`, `critic.md`, `debugger.md`, `security-reviewer.md` | Role prompts. `orchestrator.md` is the entry point; it routes work to the other roles. Most role agents are read-only; `debugger` and `orchestrator` may update files only when the requested workflow requires it. |
| Skills | `skills/phase-controller/SKILL.md`, plus `plan/`, `iterate-loop/`, `review/`, `debug/`, `trace/`, `parallel-batch/`, `auto-execute/`, `security-review/`, `local-plugin-check/`, `deep-interview/`, `doctor/` | Workflow recipes the user or agent invokes by name. |
| Workflow state | `.cursor/state/workflow-state.schema.json`, `.cursor/state/workflow-state.example.json`, `.cursor/state/README.md` | The shared state contract; file-backed, human-visible, opt-in. |
| State writer (agent-callable) | `mcp/cursor-state-bridge/` MCP tools (`state_init`, `state_set_phase`, `state_update_acceptance_criterion`, `state_record_failure`, `state_history_append`) | Sole agent-callable writer of `.cursor/state/workflow-state.json` (and per-task variants under `docs/plans/<task-id>/`). Routes through the shared `file_lock` from `.cursor/state/_locking.py`. Opt-in install via `scripts/install-local-plugin.sh --with-mcp`. |
| State writer (developer-only fallback) | `.cursor/state/workflow-state.py` plus repo wrapper `scripts/workflow-state.py` | Library API + thin CLI shim for developer terminals. Calls the same `init_state` / `set_state` / ... library functions as the bridge so concurrent CLI and bridge writes serialise on the same lock. Not invoked from agent prompts or skills. |
| Validators | `scripts/validate-workflow-state.py`, `scripts/validate-cursor-workflow-artifacts.py`, `scripts/smoke-cursor-workflow-artifacts.sh`, `scripts/validate-plugin-structure.sh`, `scripts/check-local-plugin-install.sh`, `scripts/install-local-plugin.sh` | Make the orchestration locally provable and keep the install minimal. |

## How a task flows

1. **Intake.** Create
   `docs/plans/<task-id>/workflow-state.json` from the example or with
   `python3 scripts/workflow-state.py init docs/plans/<task-id>/workflow-state.json --task-id <task-id>` in the repo (installed plugin users can call `.cursor/state/workflow-state.py`). Validate with
   `python3 scripts/validate-workflow-state.py <path>`.
2. **Research.** Invoke `.cursor/agents/researcher.md` (read-only). Capture
   findings into the state's `next_action` and notes; do not start coding.
3. **Plan.** Invoke `.cursor/agents/planner.md` or the `plan` skill. Lock in
   the acceptance-criteria list with stable `id` values.
4. **Execute.** Use the appropriate worker skill (`auto-execute`,
   `iterate-loop`, etc.). Mark each acceptance criterion as `passed` only when
   evidence is captured (a checked-in artifact path or a reproducible
   command).
5. **Verify.** Invoke `.cursor/agents/verifier.md`. The verifier confirms
   evidence; it does not run new code itself.
6. **Review.** Invoke `.cursor/agents/critic.md` and, when secrets, auth, or
   external surfaces change, also `.cursor/agents/security-reviewer.md`.
7. **Stop.** When you stop the session, the `stop-gate.py` hook reads the
   active workflow-state file (via the `OH_MY_CURSOR_WORKFLOW_STATE` env var
   or a `workflow_state` field in the stop event) and surfaces any failed or
   pending acceptance criteria so closure is intentional.

## Failure handling

When `status=failed`, route to `.cursor/agents/debugger.md` first. Record the
diagnosis under the failing acceptance criterion before retrying. Cap retries
at three (the schema enforces this).

Failure types from the schema:

- `transient` — retry without diagnosis.
- `fixable` — debugger first, then implementer.
- `needs_replan` — return to the planner.
- `escalate` — surface to the user; mark `phase=blocked`.
- `flaky` — record as flaky in history; do not consume retry budget.
- `regression` — debugger first, then implementer; require fresh evidence.

## When state is written

Workflow status is written only by an explicit, structured call. Agents and
skills route through the `cursor-state-bridge` MCP tools (`state_init`,
`state_set_phase`, `state_update_acceptance_criterion`,
`state_record_failure`, `state_history_append`); developer terminals can
also use the CLI shim at `.cursor/state/workflow-state.py`. Both paths
share the same library and the same `file_lock`. Hooks do not mutate
state. Typical write points (agent-callable form via the bridge):

- task start: `state_init { task_id, title?, phase?, ... }`
- phase advance: `state_set_phase { task_id, phase: "verify", status: "in_progress" }`
- acceptance update: `state_update_acceptance_criterion { task_id, ac_id: "AC-001", status: "passed", evidence: "scripts/check-local-plugin-install.sh" }`
- failure record: `state_record_failure { task_id, type: "fixable", message: "..." }`
- history note: `state_history_append { task_id, note: "..." }`

Developer-only equivalents (not for agents/skills):

- task start: `python3 .cursor/state/workflow-state.py init ...`
- phase advance: `python3 .cursor/state/workflow-state.py set ... --phase verify --status in_progress`
- acceptance update: `python3 .cursor/state/workflow-state.py ac ... --id AC-001 --status passed --evidence scripts/check-local-plugin-install.sh`
- failure record: `python3 .cursor/state/workflow-state.py fail ... --type fixable --message "..."`

## Boundaries

- The hooks **read** the state; they never write it.
- The plugin does not ship a background runner. Long-lived orchestration,
  cross-session resume, and queued reassignment remain
  `host-product-only` (Cursor product capabilities) and are out of scope here.
- All claims about phases, acceptance criteria, and evidence stay bounded by
  the repo's claim/proof discipline in `AGENTS.md` and `docs/state-contract.md`.

## Local validation

```bash
python3 scripts/validate-workflow-state.py
python3 scripts/validate-cursor-workflow-artifacts.py
./scripts/smoke-cursor-workflow-artifacts.sh
./scripts/check-local-plugin-install.sh
```

These four commands are enough to confirm the orchestration surface is
internally consistent before reloading Cursor.
