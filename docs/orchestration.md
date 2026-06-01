# Plugin orchestration

This is the orchestration-first entry point for `oh-my-cursor`. It explains how
the plugin's hooks, skills, agents, and state work together as one coordinated
lifecycle, and where each surface stops being repo-owned.

## Why orchestration-first

`oh-my-cursor` is a Cursor-native workflow backbone. It already ships:

- a repo-root plugin manifest at `.cursor-plugin/plugin.json`;
- project hooks at `hooks/hooks.json` plus TypeScript scripts that use Node built-ins;
- project agents in `agents/`;
- plugin-owned rules in `rules/`;
- plugin-owned skills in `skills/`; and
- bounded validators and optional runtime smokes.

What was missing was a single coordination contract that lets those surfaces
share a view of the current task. This document is that contract.

For cross-ecosystem alignment with external user assets, see the
[`external runtime bridge`](./external-runtime-bridge.md) and
[`external runtime compatibility matrix`](./external-runtime-compatibility.md).
Those documents map concepts without changing this repo's Cursor-owned state or
proof boundaries.

## Lifecycle at a glance

```text
intake → research → plan → execute → verify → review → done
                                              ↘ blocked
```

Phases are explicit. There is no background daemon and no hidden retry loop.
Each phase advance is an action on a schema-bounded JSON document that follows
[`.cursor/state/workflow-state.schema.json`](../.cursor/state/workflow-state.schema.json).

## Repo-owned surfaces in the lifecycle

| Surface | File(s) | Role in the lifecycle |
| --- | --- | --- |
| Plugin manifest | `.cursor-plugin/plugin.json` | Declares the repo-root plugin and points Cursor at the rules, skills, agents, and hooks payload. |
| Hooks | `hooks/hooks.json` plus TypeScript scripts using Node built-ins under `hooks/` | Fourteen documented Cursor hook events are wired (`sessionStart` → `session-bootstrap.ts`; `sessionEnd` → `session-summary.ts`; `beforeSubmitPrompt` → `prompt-router.ts`; `preToolUse` → `tool-guard.ts`; `postToolUse` → `state-watcher.ts`; `postToolUseFailure` → `failure-router.ts`; `subagentStart` → `subagent-bootstrap.ts`; `subagentStop` → `subagent-summary.ts`; `beforeShellExecution` → `shell-guard.ts`; `afterShellExecution` → `shell-debrief.ts`; `beforeReadFile` → `read-advisor.ts`; `afterFileEdit` → `claim-guard.ts`; `preCompact` → `compact-reminder.ts`; `stop` → `stop-gate.ts`). All scripts are fail-open, observational unless a tightly bounded severe pattern is detected, and **read** workflow-state — they never write it. |
| Agents | `agents/orchestrator.md`, `architect.md`, `researcher.md`, `planner.md`, `implementer.md`, `qa-tester.md`, `verifier.md`, `critic.md`, `code-reviewer.md`, `debugger.md`, `tracer.md`, `security-reviewer.md`, `explore.md`, `test-engineer.md` | Role prompts. `orchestrator.md` is the entry point; it routes work to the other roles. Most role agents are read-only; `debugger`, `implementer`, `orchestrator`, and `test-engineer` may update files only when the requested workflow requires it, while `qa-tester` may run bounded validation commands without editing files. |
| Skills | `skills/*/SKILL.md` (20 total; see Skills table below) | Workflow recipes the user or agent invokes by name. Invoke by name from agent prompts or user input. |
| Memory layer | `docs/memory-layer.md`, `docs/templates/` | Notepad, project memory, decisions, and wiki — skill-owned writes, separate from workflow-state. |
| Workflow state | `.cursor/state/workflow-state.schema.json`, `.cursor/state/workflow-state.example.json`, `.cursor/state/README.md` | The shared state contract; file-backed, human-visible, opt-in. |
| State writer (agent-callable) | `mcp/cursor-state-bridge/` MCP tools (`state_init`, `state_set_phase`, `state_update_acceptance_criterion`, `state_record_failure`, `state_history_append`) | Sole agent-callable writer of `.cursor/state/workflow-state.json` (and per-task variants under `docs/plans/<task-id>/`). Routes through the shared `file_lock` from `src/oh_my_cursor/workflow_state/locking.ts`. Opt-in install via `scripts/install-local-plugin.ts --with-mcp`. |
| State writer (developer-only fallback) | `scripts/workflow-state.ts` (`.cursor/state/workflow-state.ts` compatibility shim in installed payloads) | CLI wrapper over the packaged workflow-state API for developer terminals. Calls the same `init_state` / `set_state` / ... library functions as the bridge so concurrent CLI and bridge writes serialise on the same lock. Not invoked from agent prompts or skills. |
| Validators | `scripts/validate-workflow-state.ts`, `scripts/validate-cursor-workflow-artifacts.ts`, `scripts/smoke-cursor-workflow-artifacts.ts`, `scripts/validate-plugin-structure.ts`, `scripts/check-local-plugin-install.ts`, `scripts/install-local-plugin.ts` | Make the orchestration locally provable and keep the install minimal. |

## How a task flows

1. **Intake.** Create
   `docs/plans/<task-id>/workflow-state.json` from the example or with
   `node --experimental-strip-types scripts/workflow-state.ts init docs/plans/<task-id>/workflow-state.json --task-id <task-id>` in the repo. Validate with
   `node --experimental-strip-types scripts/validate-workflow-state.ts <path>`.
2. **Research.** Invoke `agents/researcher.md` (read-only). Capture
   findings into the state's `next_action` and notes; do not start coding.
3. **Plan.** Invoke `agents/planner.md` or the `plan` skill. For broad or high-risk changes, invoke `agents/architect.md` before execution to check boundaries and invariants. Lock in
   the acceptance-criteria list with stable `id` values.
4. **Execute.** Use the appropriate worker skill (`auto-execute`,
   `iterate-loop`, etc.). Mark each acceptance criterion as `passed` only when
   evidence is captured (a checked-in artifact path or a reproducible
   command).
5. **Verify.** Invoke `agents/qa-tester.md` when fresh runtime evidence is needed, then `agents/verifier.md` to gate that evidence. The verifier confirms evidence; it does not run new code itself.
6. **Review.** Reviewers (`review` skill, `critic` and `code-reviewer` agents,
   plus optional `security-review` skill) run against the changes. Verdicts are
   mapped to a shared loop gate (`pass`, `comment`, `block`) as defined in
   `skills/iterate-loop/SKILL.md`.
7. **Stop.** When you stop the session, the `stop-gate.ts` hook reads the
   active workflow-state file (via the `OH_MY_CURSOR_WORKFLOW_STATE` env var
   or a `workflow_state` field in the stop event) and surfaces any failed or
   pending acceptance criteria so closure is intentional.

## Cursor CLI continuation pattern

Cursor CLI can be the **host-product driver** for a Ralph-like continuation
loop without turning the plugin itself into a background runner. Resolve the
local CLI model from the user's Cursor config instead of hardcoding a model ID:

```bash
MODEL="$(node --experimental-strip-types scripts/resolve-cursor-model.ts)"
```

If a particular model is required for a runtime smoke, override with
`CURSOR_SMOKE_MODEL=<model-id>` and let the smoke prove that the account can use
it. A resumed CLI turn can load the local plugin and ask the phase controller to
continue:

```bash
agent \
  --workspace /path/to/workspace \
  --plugin-dir ~/.cursor/plugins/local/oh-my-cursor \
  --model "$MODEL" \
  --continue \
  "Continue with phase-controller from the active workflow-state."
```

The Cursor CLI binary is documented as `agent` in current Cursor docs (see
`docs/references.md`); the legacy alias `cursor-agent` is still understood by
installs that shipped earlier and is what existing smoke scripts under
`scripts/` invoke. Use `--resume <chat-id>` instead of `--continue` when
targeting a specific thread. For scripted turns, pair the same flags with
`--print --trust` only when the caller intentionally wants non-interactive
execution. The plugin then contributes repo-owned rules, skills, agents, hooks,
and optional `cursor-state-bridge` MCP tools to that resumed Cursor session.
Subagents remain Cursor-managed runs launched by the parent agent; the durable
part this repo owns is the small workflow-state document and the validation
contract around it.

This keeps the wording precise:

- **repo-owned**: role prompts, skills, hook wiring, workflow-state schema,
  validators, and the optional state bridge;
- **host-product-only**: CLI model selection, chat resume, subagent execution,
  and Cloud Agent handoff; and
- **unsupported here**: a repo-file daemon that keeps local subagents running
  after the Cursor host session ends.

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
also use the CLI wrapper at `scripts/workflow-state.ts`. Both paths
share the same library and the same `file_lock`. Hooks do not mutate
state. Typical write points (agent-callable form via the bridge):

- task start: `state_init { task_id, title?, phase?, ... }`
- phase advance: `state_set_phase { task_id, phase: "verify", status: "in_progress" }`
- acceptance update: `state_update_acceptance_criterion { task_id, ac_id: "AC-001", status: "passed", evidence: "scripts/check-local-plugin-install.ts" }`
- failure record: `state_record_failure { task_id, type: "fixable", message: "..." }`
- history note: `state_history_append { task_id, note: "..." }`

Developer-only equivalents (not for agents/skills):

- task start: `node --experimental-strip-types scripts/workflow-state.ts init ...`
- phase advance: `node --experimental-strip-types scripts/workflow-state.ts set ... --phase verify --status in_progress`
- acceptance update: `node --experimental-strip-types scripts/workflow-state.ts ac ... --id AC-001 --status passed --evidence scripts/check-local-plugin-install.ts`
- failure record: `node --experimental-strip-types scripts/workflow-state.ts fail ... --type fixable --message "..."`

## Skills Enumeration (20 repo-owned, checked-in-artifact)

| Skill | Governance | Primary MCP Tools | Invoked When | Phase(s) |
| --- | --- | --- | --- | --- |
| phase-controller | repo-owned, checked-in-artifact | state_read, state_init, state_set_phase, state_record_failure, state_update_acceptance_criterion, state_history_append | Session start or task reassignment | any |
| auto-execute | repo-owned, checked-in-artifact | state_init, state_set_phase, state_record_failure, state_update_acceptance_criterion | User requests "autopilot" or full pipeline execution | intake→execute→verify→review |
| debug | repo-owned, checked-in-artifact | state_read, state_record_failure | Debugging requested or failure route selected | blocked/failed |
| deep-interview | repo-owned, checked-in-artifact | None | Vague request needs scoping or clarification | intake/research |
| doctor | repo-owned, checked-in-artifact | None | Diagnostic check of Cursor + repo installation | intake |
| iterate-loop | repo-owned, checked-in-artifact | state_record_failure, state_update_acceptance_criterion, state_history_append | Execute phase with multiple acceptance criteria | execute |
| local-plugin-check | repo-owned, checked-in-artifact | None | User verifies local plugin installation | intake |
| mcp-setup | repo-owned, checked-in-artifact | state_* + memory_* (full bridge surface) | MCP bridge setup or verification requested | intake |
| parallel-batch | repo-owned, checked-in-artifact | None | Independent tasks can run as separate CLI parent processes | execute |
| plan | repo-owned, checked-in-artifact | None | User requests planning or orchestrator routes to plan phase | plan |
| review | repo-owned, checked-in-artifact | None | Orchestrator routes to review phase | review |
| security-review | repo-owned, checked-in-artifact | None | Security review requested or auth/secrets/shell changes | review |
| team-controller | repo-owned, checked-in-artifact | None | Orchestrating concurrent agent execution lanes across independent tasks | execute/verify |
| trace | repo-owned, checked-in-artifact | state_read | Causal investigation or flow tracing requested | blocked/failed |
| verify | repo-owned, checked-in-artifact | state_update_acceptance_criterion, state_read | Acceptance criteria validation requested | verify |
| remember | repo-owned, checked-in-artifact | memory_* (optional), state_history_append | Route a finding to the correct memory surface | any |
| notepad | repo-owned, checked-in-artifact | memory_notepad_read, memory_notepad_append_working | Read/update Priority, Working, or MANUAL sections | any |
| wiki | repo-owned, checked-in-artifact | memory_wiki_log_append | Wiki page lifecycle + append-only log | any |
| decisions | repo-owned, checked-in-artifact | None | Create or supersede ADRs under docs/decisions/ | plan/review |
| rules-authoring | repo-owned, checked-in-artifact | None | Add a new plugin or workspace rule with install parity | any |

## Hook → Skill Wiring (14 hooks, state-aware invocation)

| Hook | File | Primary Skill/Agent | Condition | Phases |
| --- | --- | --- | --- | --- |
| sessionStart | session-bootstrap.ts | phase-controller | Surfaces session/workspace context for phase-controller | any |
| sessionEnd | session-summary.ts | orchestrator | Summarizes session shutdown state | done/blocked |
| beforeSubmitPrompt | prompt-router.ts | orchestrator | Surfaces matching skill, agent, and phase hints | intake |
| preToolUse | tool-guard.ts | orchestrator | Checks tool allowlist per active role | any |
| postToolUse | state-watcher.ts | orchestrator | Revalidates workflow-state after explicit state writes | any |
| postToolUseFailure | failure-router.ts | debugger or tracer | Suggests diagnosis routes after tool failure | failed |
| subagentStart | subagent-bootstrap.ts | orchestrator | Matches subagent role scope to checked-in prompts | any |
| subagentStop | subagent-summary.ts | orchestrator | Observes subagent completion summary | any |
| beforeShellExecution | shell-guard.ts | orchestrator | Checks shell commands for safety | any |
| afterShellExecution | shell-debrief.ts | orchestrator | Summarizes shell execution outcome | any |
| beforeReadFile | read-advisor.ts | orchestrator | Advises on file read scope | research/review |
| afterFileEdit | claim-guard.ts | verifier or critic | Checks edited files against claim boundaries | execute/verify/review |
| preCompact | compact-reminder.ts | orchestrator | Reminds user to verify acceptance criteria before compact | verify/review |
| stop | stop-gate.ts | orchestrator | Final validation: no pending/failed criteria before stop | done |

## Governable Agent Start Contract

Checked-in agent files are governed as a role registry:

- every role must live at `agents/<name>.md` and use matching kebab-case
  `name` frontmatter;
- every checked-in role keeps `model: auto` until benchmark evidence justifies a
  pinned model; see [`agent-model-policy.md`](./agent-model-policy.md) for the
  role suitability matrix and promotion path;
- `readonly` is policy, not decoration: read/review roles stay read-only, while
  `orchestrator`, `implementer`, `debugger`, and `test-engineer` are the only
  file-editing roles in the baseline; `qa-tester` may run bounded validation commands but must not edit files;
- `subagentStart` maps host-provided subagent types to those role prompts and
  records the active role for tool guards; and
- `subagentStop` clears the active role and records an observational summary
  without consuming the follow-up loop budget.

`scripts/validate-cursor-workflow-artifacts.ts` is the registry gate. It fails
if a role file is missing, renamed without matching frontmatter, pinned to a
non-`auto` model, loses the `[OMCS]` prefix, or drifts from the expected
readonly policy. `scripts/validate-agent-model-policy.ts` adds the model-policy
gate, and `scripts/smoke-agent-model-suitability.ts` provides an optional
environment-gated prompt smoke for role/model suitability. The smoke checks a
small representative role sample by default; use `--all-roles` only for a longer
benchmark run. Cursor still owns the actual decision to launch a subagent; this
repo owns the prompt files, role policy, hooks, and validation around that
launch.

## Boundaries

- The hooks **read** the state; they never write it.
- The plugin does not ship a background runner. CLI resume, model selection,
  subagent execution, Cloud Agent handoff, and queued reassignment remain
  `host-product-only` Cursor capabilities that this repo can guide but not
  provision as checked-in runtime state.
- All claims about phases, acceptance criteria, and evidence stay bounded by
  the repo's claim/proof discipline in `AGENTS.md` and `docs/state-contract.md`.

## Local validation

```bash
node --experimental-strip-types scripts/validate-workflow-state.ts
node --experimental-strip-types scripts/validate-cursor-workflow-artifacts.ts
node --experimental-strip-types scripts/smoke-cursor-workflow-artifacts.ts
node --experimental-strip-types scripts/check-local-plugin-install.ts
```

These four commands are enough to confirm the orchestration surface is
internally consistent before reloading Cursor.
