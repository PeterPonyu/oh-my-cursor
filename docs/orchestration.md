# Plugin orchestration

This is the orchestration-first entry point for `oh-my-cursor`. It explains how
the plugin's hooks, skills, agents, and state work together as one coordinated
lifecycle, and where each surface stops being repo-owned.

## Why orchestration-first

`oh-my-cursor` is a Cursor-native workflow backbone. It already ships:

- a repo-root plugin manifest at `.cursor-plugin/plugin.json`;
- project hooks at `hooks/hooks.json` plus stdlib-only Python scripts;
- project agents in `agents/`;
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
| Hooks | `hooks/hooks.json` plus stdlib-only Python scripts under `hooks/` | Fourteen documented Cursor hook events are wired (`sessionStart` → `session-bootstrap.py`; `sessionEnd` → `session-summary.py`; `beforeSubmitPrompt` → `prompt-router.py`; `preToolUse` → `tool-guard.py`; `postToolUse` → `state-watcher.py`; `postToolUseFailure` → `failure-router.py`; `subagentStart` → `subagent-bootstrap.py`; `subagentStop` → `subagent-summary.py`; `beforeShellExecution` → `shell-guard.py`; `afterShellExecution` → `shell-debrief.py`; `beforeReadFile` → `read-advisor.py`; `afterFileEdit` → `claim-guard.py`; `preCompact` → `compact-reminder.py`; `stop` → `stop-gate.py`). All scripts are fail-open, observational unless a tightly bounded severe pattern is detected, and **read** workflow-state — they never write it. |
| Agents | `agents/orchestrator.md`, `researcher.md`, `planner.md`, `implementer.md`, `verifier.md`, `critic.md`, `code-reviewer.md`, `debugger.md`, `tracer.md`, `security-reviewer.md`, `explore.md`, `test-engineer.md` | Role prompts. `orchestrator.md` is the entry point; it routes work to the other roles. Most role agents are read-only; `debugger`, `implementer`, and `orchestrator` may update files only when the requested workflow requires it. |
| Skills | `skills/*/SKILL.md` (14 total; see Skills table below) | Workflow recipes the user or agent invokes by name. Invoke by name from agent prompts or user input. |
| Workflow state | `.cursor/state/workflow-state.schema.json`, `.cursor/state/workflow-state.example.json`, `.cursor/state/README.md` | The shared state contract; file-backed, human-visible, opt-in. |
| State writer (agent-callable) | `mcp/cursor-state-bridge/` MCP tools (`state_init`, `state_set_phase`, `state_update_acceptance_criterion`, `state_record_failure`, `state_history_append`) | Sole agent-callable writer of `.cursor/state/workflow-state.json` (and per-task variants under `docs/plans/<task-id>/`). Routes through the shared `file_lock` from `.cursor/state/_locking.py`. Opt-in install via `scripts/install-local-plugin.sh --with-mcp`. |
| State writer (developer-only fallback) | `.cursor/state/workflow-state.py` | Library API + thin CLI shim for developer terminals. Calls the same `init_state` / `set_state` / ... library functions as the bridge so concurrent CLI and bridge writes serialise on the same lock. Not invoked from agent prompts or skills. |
| Validators | `scripts/validate-workflow-state.py`, `scripts/validate-cursor-workflow-artifacts.py`, `scripts/smoke-cursor-workflow-artifacts.sh`, `scripts/validate-plugin-structure.sh`, `scripts/check-local-plugin-install.sh`, `scripts/install-local-plugin.sh` | Make the orchestration locally provable and keep the install minimal. |

## How a task flows

1. **Intake.** Create
   `docs/plans/<task-id>/workflow-state.json` from the example or with
   `python3 .cursor/state/workflow-state.py init docs/plans/<task-id>/workflow-state.json --task-id <task-id>` in the repo. Validate with
   `python3 scripts/validate-workflow-state.py <path>`.
2. **Research.** Invoke `agents/researcher.md` (read-only). Capture
   findings into the state's `next_action` and notes; do not start coding.
3. **Plan.** Invoke `agents/planner.md` or the `plan` skill. Lock in
   the acceptance-criteria list with stable `id` values.
4. **Execute.** Use the appropriate worker skill (`auto-execute`,
   `iterate-loop`, etc.). Mark each acceptance criterion as `passed` only when
   evidence is captured (a checked-in artifact path or a reproducible
   command).
5. **Verify.** Invoke `agents/verifier.md`. The verifier confirms
   evidence; it does not run new code itself.
6. **Review.** Reviewers (`review` skill, `critic` and `code-reviewer` agents,
   plus optional `security-review` skill) run against the changes. Verdicts are
   mapped to a shared loop gate (`pass`, `comment`, `block`) as defined in
   `skills/iterate-loop/SKILL.md`.
7. **Stop.** When you stop the session, the `stop-gate.py` hook reads the
   active workflow-state file (via the `OH_MY_CURSOR_WORKFLOW_STATE` env var
   or a `workflow_state` field in the stop event) and surfaces any failed or
   pending acceptance criteria so closure is intentional.

## Failure handling

When `status=failed`, route to `agents/debugger.md` first. Record the
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

## Skills Enumeration (14 repo-owned, checked-in-artifact)

| Skill | Governance | Primary MCP Tools | Invoked When | Phase(s) |
| --- | --- | --- | --- | --- |
| phase-controller | repo-owned, checked-in-artifact | state_init, state_set_phase, state_read | Session start or task reassignment | any |
| plan | repo-owned, checked-in-artifact | None | User requests planning or orchestrator routes to plan phase | plan |
| iterate-loop | repo-owned, checked-in-artifact | state_record_failure, state_update_acceptance_criterion, state_history_append | Execute phase with multiple acceptance criteria | execute |
| review | repo-owned, checked-in-artifact | None | Orchestrator routes to review phase | review |
| auto-execute | repo-owned, checked-in-artifact | state_set_phase, state_update_acceptance_criterion | User requests "autopilot" or full pipeline execution | intake→execute→verify→review |
| security-review | repo-owned, checked-in-artifact | None | Security review requested or auth/secrets/shell changes | review |
| code-reviewer | repo-owned, checked-in-artifact | None | Orchestrator routes to review phase | review |
| local-plugin-check | repo-owned, checked-in-artifact | None | User verifies local plugin installation | intake |
| deep-interview | repo-owned, checked-in-artifact | None | Vague request needs scoping or clarification | intake/research |
| doctor | repo-owned, checked-in-artifact | None | Diagnostic check of Cursor + repo installation | intake |
| mcp-setup | repo-owned, checked-in-artifact | None | MCP bridge setup or verification requested | intake |
| verify | repo-owned, checked-in-artifact | state_update_acceptance_criterion, state_read | Acceptance criteria validation requested | verify |

## Hook → Skill Wiring (14 hooks, state-aware invocation)

| Hook | File | Primary Skill/Agent | Condition | Phases |
| --- | --- | --- | --- | --- |
| sessionStart | session-bootstrap.py | phase-controller | Initializes workflow-state; calls orchestrator | any |
| sessionEnd | session-summary.py | orchestrator | Session shutdown; validates final state | done/blocked |
| beforeSubmitPrompt | prompt-router.py | orchestrator | Routes vague requests to deep-interview | intake |
| preToolUse | tool-guard.py | orchestrator | Validates tool allowlist per active role | any |
| postToolUse | state-watcher.py | orchestrator | Tracks phase state after tool execution | any |
| postToolUseFailure | failure-router.py | debugger or tracer | Routes failures to diagnosis phase | failed |
| subagentStart | subagent-bootstrap.py | orchestrator | Validates subagent role scope | any |
| subagentStop | subagent-summary.py | orchestrator | Validates subagent produced expected output | any |
| beforeShellExecution | shell-guard.py | orchestrator | Validates shell commands for safety | any |
| afterShellExecution | shell-debrief.py | orchestrator | Captures shell output for workflow-state | any |
| beforeReadFile | read-advisor.py | orchestrator | Validates file read scope (read-advisor hook) | research/review |
| afterFileEdit | claim-guard.py | verifier or critic | Validates edited files match acceptance criteria | execute/verify/review |
| preCompact | compact-reminder.py | orchestrator | Reminds user to verify acceptance criteria before compact | verify/review |
| stop | stop-gate.py | orchestrator | Final validation: no pending/failed criteria before stop | done |

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
