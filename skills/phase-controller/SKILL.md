---
name: phase-controller
description: Orchestration-first entry point for oh-my-cursor workflows. Invoke with @phase-controller in the Cursor composer to start or resume a workflow. Detects the current phase from the checked-in workflow-state file, routes the next step to the right role and skill, and keeps acceptance criteria aligned with the repo contract.
---

# Phase controller

This is the orchestration-first skill for `oh-my-cursor`. It treats the
workflow as an explicit state machine that is **file-backed**,
**human-visible**, and **bounded**. There is no background daemon, hidden
queue, or automatic retry; each phase advance is an explicit action on a
checked-in JSON document.

## When to use

Use this skill at the start of any non-trivial task and before stopping a
session. It complements existing skills (`plan`, `iterate-loop`, `review`,
`debug`, `trace`) by deciding **which one to invoke next**. `debug` is the
diagnosis-first lane; `trace` is its causal-investigation peer for harder
"why did this happen?" questions.

## Steps

1. **Locate or create the state file.** The canonical location is
   `.cursor/state/workflow-state.json`; this is the path that
   `stop-gate.py`, `compact-reminder.py`, `state-watcher.py`, and the
   default bridge resolver all read. Per-task archives at
   `docs/plans/<task-id>/workflow-state.json` are opt-in (pass `task_id`
   when calling `state_init` to use that subdirectory). Agent-callable
   writes go through the `cursor-state-bridge` MCP tools (`state_init`,
   `state_set_phase`, `state_update_acceptance_criterion`,
   `state_record_failure`, `state_history_append`, `state_read`); both
   targets share the bridge's `file_lock` invariant. Validate the
   on-disk document against
   `.cursor/state/workflow-state.schema.json` with the read-only
   validator `python3 scripts/validate-workflow-state.py <path>`; the
   validator does not write and remains agent-callable.
2. **Detect the current phase.** Read `phase` and `status`. If `phase` is
   missing, set `phase=intake`, `status=pending`.
3. **Decide the next action.**
   - `intake` → record `task_id`, `title`, and an initial acceptance-criteria
     list, then advance to `research`.
   - `research` → invoke the `researcher` agent, capture findings, then advance
     to `plan`.
   - `plan` → invoke the `planner` agent or the `plan` skill, finalize the
     acceptance-criteria list, then advance to `execute`.
   - `execute` → use the appropriate implementation skill (`auto-execute`,
     `iterate-loop`, etc.). Mark each acceptance criterion as `passed` only when
     evidence is captured.
   - `verify` → invoke the `verifier` agent. It must check evidence, not run
     code itself.
   - `review` → invoke `critic` and `code-reviewer` **always**; additionally
     invoke `security-reviewer` when the change touches secrets, auth, supply
     chain, or external surfaces. All reviewers' verdicts feed the shared loop
     gate defined in `skills/iterate-loop/SKILL.md`: `APPROVE`/`passed` → `pass`,
     `COMMENT`/`comment` → `comment`, `REQUEST CHANGES`/`needs_changes`/`blocking`
     → `block`. Advance to `done` only when every reviewer that ran maps to
     `pass` or `comment`.
   - `done` → set `status=passed` and stop. The `stop-gate.py` hook will use
     this state to confirm closure.
   - `blocked` → surface the blocking criteria, invoke `debugger` or `tracer`.
4. **Tighten the acceptance criteria during intake.** Every criterion must name
   a specific file, test, or observable artifact. Never accept
   "the code works" as a criterion.
5. **Keep the state document small.** No inline embeddings of full files or
   full agent transcripts. Store paths, hashes, and short summaries.
6. **Before session stop**, check that every acceptance criterion is `passed`
   or that the phase is `blocked` with an explicit reason. The `stop-gate.py`
   hook will remind the user.

## State contract

The state document follows
[`.cursor/state/workflow-state.schema.json`](../../.cursor/state/workflow-state.schema.json).

Phases:

```
intake → research → plan → execute → verify → review → done
                                              ↘ blocked
```

Statuses per phase: `pending | in_progress | passed | failed | blocked`.

## Orchestration role

- **Lifecycle phase(s)**: All phases
- **Invoked by**: User at session start, or by `auto-execute`, `iterate-loop` when resuming
- **Invokes**: Routes to agents (orchestrator, researcher, planner, implementer, verifier, critic, debugger, tracer) and skills (plan, iterate-loop, review, debug, trace, etc.)
- **State contract**: Reads/writes `.cursor/state/workflow-state.json` (or per-task archive at `docs/plans/<task-id>/workflow-state.json`)
- **Failure handling**: Records failures via `state_record_failure` MCP tool or direct JSON update; routes to debugger or tracer agents

| Phase | Recommended role | Agent prompt |
| --- | --- | --- |
| any | orchestrator | `agents/orchestrator.md` |
| research | researcher, explore | `agents/researcher.md`, `agents/explore.md` |
| plan | planner | `agents/planner.md` |
| execute | implementer (or skill) | `agents/implementer.md` |
| verify | verifier, test-engineer | `agents/verifier.md`, `agents/test-engineer.md` |
| review | critic, security-reviewer, code-reviewer | `agents/critic.md`, `agents/security-reviewer.md`, `agents/code-reviewer.md` |
| any failure | debugger, tracer | `agents/debugger.md`, `agents/tracer.md` |

### Team & Sub-agents

The phase controller dispatches work to checked-in agents as **Cursor sub-agents**.
There is no external team server or background daemon — every agent runs within the
same Cursor workspace. Each agent has a defined role, tool allowlist, and is
bootstrapped via the `subagentStart` / `subagentStop` hooks in `hooks/hooks.json`.

- **Bootstrap**: `subagentStart` fires when a sub-agent session opens, injecting
  the matching `agents/<role>.md` prompt.
- **Teardown**: `subagentStop` fires at session end with an observational summary;
  it never consumes the auto-follow-up loop budget.
- **Platform**: Works on macOS, Linux, and Windows. All agents are invoked as
  sub-agents within a single Cursor workspace — no multi-window dependency.

Full details in [`docs/team-mode.md`](../../docs/team-mode.md).

## Governance

### Ownership Class
- **repo-owned**: This skill is checked in at `skills/phase-controller/SKILL.md` and is the orchestration entry point for the repo's workflow-state contract.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: Cursor does not document a workflow-state primitive; this is repo-owned.
- **checked-in-artifact**: Proof: `.cursor/state/workflow-state.schema.json`, `agents/orchestrator.md`, `hooks/hooks.json` (state-watcher, stop-gate hooks), `scripts/validate-workflow-state.py`.
- **runtime-smoke** (optional): When `cursor-state-bridge` MCP is installed, bridge tools provide runtime proof; default install excludes MCP.

### Claim Summary
This skill provides the orchestration entry point for `oh-my-cursor` workflows. It reads the checked-in workflow-state document, detects the current phase, and routes to the appropriate agent or skill. The state contract is repo-owned and file-backed; writes go through the optional `cursor-state-bridge` MCP server when available, or through the developer-only CLI shim in the scripts directory as a fallback (direct file edits are not recommended after phase controller bootstraps state).

## MCP integration points

| Tool/Resource | MCP Server | Purpose | Required |
|---|---|---|---|
| `state_init` | cursor-state-bridge | Initialize workflow-state document | No |
| `state_set_phase` | cursor-state-bridge | Advance to next phase | No |
| `state_update_acceptance_criterion` | cursor-state-bridge | Record criterion pass/fail | No |
| `state_record_failure` | cursor-state-bridge | Log phase failure | No |
| `state_history_append` | cursor-state-bridge | Append run notes | No |
| `state_read` | cursor-state-bridge | Read current state | No |

MCP bridge is opt-in via `./scripts/install-local-plugin.sh --with-mcp`. Default install uses direct file I/O with `.cursor/state/workflow-state.json`.

## Hook dependencies

| Hook Event | Script | Purpose |
|---|---|---|
| `postToolUse` | `state-watcher.py` | Observes tool execution, validates schema (read-only) |
| `stop` | `stop-gate.py` | Reads current phase before session stop |
| `preCompact` | `compact-reminder.py` | Reminds user of current phase before compacting |

Hooks are read-only observers; they do not write workflow-state directly.
