---
name: phase-controller
description: "[OMCS] The single orchestration root for oh-my-cursor workflows. Invoke with @phase-controller in the Cursor composer to start or resume ANY non-trivial task. Detects the current phase from the single checked-in workflow-state contract, routes the next step to the right role and skill, and keeps acceptance criteria aligned with the repo contract."
---

# Phase controller

This is **the single orchestration root** for `oh-my-cursor`. Every
non-trivial workflow starts or resumes here. It treats the workflow as an
explicit state machine that is **file-backed**, **human-visible**, and
**bounded**, against one canonical contract: `.cursor/state/workflow-state.json`.
There is no background daemon, hidden queue, or automatic retry; each phase
advance is an explicit action on a schema-bounded JSON document.

The `auto-execute` skill is the **autonomous preset** over this controller:
it calls into this same state machine and runs it to completion without
pausing between phases. `iterate-loop` is the **execute/verify/review loop
primitive** this controller invokes during the `execute` phase. All three
share the single `.cursor/state/workflow-state.json` contract; there is no
parallel state file.

## When to use

Use this skill to **start or resume any non-trivial task**, and before
stopping a session. It is the entry point that decides which other skill
(`plan`, `iterate-loop`, `review`, `debug`, `trace`) to invoke next. For
hands-off autonomous runs, use the `auto-execute` preset, which drives this
controller. `debug` is the diagnosis-first lane; `trace` is its
causal-investigation peer for harder "why did this happen?" questions.

For Cursor CLI runs, this skill is the right re-entry point after
`cursor-agent --resume <chat-id>` or `cursor-agent --continue`. The parent CLI
session should resolve its model with `scripts/resolve-cursor-model.py` or an
explicit `CURSOR_SMOKE_MODEL` override instead of hardcoding a model ID. The
checked-in role agents still use `model: auto` unless benchmark evidence
justifies pinning them.

## Steps

1. **Locate or create the state file.** The live session default is
   `.cursor/state/workflow-state.json`; this is the path that
   `stop-gate.ts`, `compact-reminder.ts`, `state-watcher.ts`, and the
   default bridge resolver read. Packaging validators intentionally fail if a
   live runtime file is left there, so use a per-task archive or temporary path
   for smoke tests and remove `.cursor/state/workflow-state.json` before
   building or validating the plugin payload. Per-task archives at
   `docs/plans/<task-id>/workflow-state.json` are opt-in (pass `task_id`
   when calling `state_init` to use that subdirectory). Agent-callable writes go
   through the `cursor-state-bridge` MCP tools (`state_init`,
   `state_set_phase`, `state_update_acceptance_criterion`,
   `state_record_failure`, `state_history_append`, `state_read`); both
   targets share the bridge's `file_lock` invariant. Validate the
   on-disk document against
   `.cursor/state/workflow-state.schema.json` with the read-only
   validator `node --experimental-strip-types scripts/validate-workflow-state.ts <path>`; the
   validator does not write and remains agent-callable.
2. **Detect the current phase.** Read `phase` and `status`. If `phase` is
   missing, set `phase=intake`, `status=pending`.
3. **Decide the next action.**
   - `intake` → record `task_id`, `title`, and an initial acceptance-criteria
     list; optionally read `notepad.md` Priority Context via `skills/notepad`
     when the file exists, then advance to `research`.
   - `research` → invoke the `researcher` agent, capture findings, then advance
     to `plan`.
   - `plan` → invoke the `planner` agent or the `plan` skill, invoke `architect` for broad or high-risk changes, skim `docs/decisions/` index when present, finalize the
     acceptance-criteria list, then advance to `execute`.
   - `execute` → use the appropriate implementation skill (`iterate-loop`,
     etc.). Mark each acceptance criterion as `passed` only when
     evidence is captured.
   - `verify` → invoke `qa-tester` when runtime proof is needed, then the `verifier` agent. The verifier checks evidence and does not run broad exploratory work.
   - `review` → invoke `critic` and `code-reviewer` **always**; additionally
     invoke `security-reviewer` when the change touches secrets, auth, supply
     chain, or external surfaces. All reviewers' verdicts feed the shared loop
     gate defined in `skills/iterate-loop/SKILL.md`: `APPROVE`/`passed` → `pass`,
     `COMMENT`/`comment` → `comment`, `REQUEST CHANGES`/`needs_changes`/`blocking`
     → `block`. Advance to `done` only when every reviewer that ran maps to
     `pass` or `comment`.
   - `done` → set `status=passed` and stop. The `stop-gate.ts` hook will use
     this state to confirm closure.
   - `blocked` → surface the blocking criteria, invoke `debugger` or `tracer`.
4. **Tighten the acceptance criteria during intake.** Every criterion must name
   a specific file, test, or observable artifact. Never accept
   "the code works" as a criterion.
5. **Keep the state document small.** No inline embeddings of full files or
   full agent transcripts. Store paths, hashes, and short summaries.
6. **Before session stop**, check that every acceptance criterion is `passed`
   or that the phase is `blocked` with an explicit reason. The `stop-gate.ts`
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
- **Invoked by**: User at session start (the single orchestration root), or by the `auto-execute` preset that drives this controller autonomously
- **Invokes**: Routes to agents (orchestrator, architect, researcher, planner, implementer, qa-tester, verifier, critic, debugger, tracer) and skills (plan, iterate-loop, review, debug, trace, etc.)
- **State contract**: Reads `.cursor/state/workflow-state.json` (or per-task archive at `docs/plans/<task-id>/workflow-state.json`); agent-callable writes go through the `cursor-state-bridge` MCP tools when installed.
- **Failure handling**: Records failures via `state_record_failure` MCP tool when available; otherwise reports the failure route without directly editing workflow-state.

| Phase | Recommended role | Agent prompt |
| --- | --- | --- |
| any | orchestrator | `agents/orchestrator.md` |
| research | researcher, explore | `agents/researcher.md`, `agents/explore.md` |
| plan | planner, architect | `agents/planner.md`, `agents/architect.md` |
| execute | implementer (or skill) | `agents/implementer.md` |
| verify | qa-tester, verifier, test-engineer | `agents/qa-tester.md`, `agents/verifier.md`, `agents/test-engineer.md` |
| review | critic, security-reviewer, code-reviewer | `agents/critic.md`, `agents/security-reviewer.md`, `agents/code-reviewer.md` |
| any failure | debugger, tracer | `agents/debugger.md`, `agents/tracer.md` |

### Team & Sub-agents

The phase controller dispatches work to checked-in agents as **Cursor sub-agents**.
There is no external team server or background daemon — every agent runs within the
same Cursor workspace. Each agent has a defined role, tool allowlist, and is
bootstrapped via the `subagentStart` / `subagentStop` hooks in `hooks/hooks.json`.
When a CLI parent session is resumed, the phase controller rereads
workflow-state and delegates the next phase again rather than relying on hidden
subagent memory.

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
- **host-product-only**: Cursor CLI resume, model selection, and subagent execution mentioned by this skill remain host-product capabilities.
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: Cursor does not document a workflow-state primitive; this is repo-owned.
- **checked-in-artifact**: Proof: `.cursor/state/workflow-state.schema.json`, `agents/orchestrator.md`, `hooks/hooks.json` (state-watcher, stop-gate hooks), `scripts/validate-workflow-state.ts`.
- **runtime-smoke** (optional): When `cursor-state-bridge` MCP is installed, bridge tools provide runtime proof; default install excludes MCP.

### Claim Summary
This skill provides the orchestration entry point for `oh-my-cursor` workflows. It reads the checked-in workflow-state document, detects the current phase, and routes to the appropriate agent or skill. The state contract is repo-owned and file-backed; agent-callable writes go through the optional `cursor-state-bridge` MCP server when available. If the bridge is unavailable, report the structured update for the user or host to apply; do not use the developer-only CLI shim or direct JSON edits as an agent fallback.

## MCP integration points

| Tool/Resource | MCP Server | Purpose | Required |
|---|---|---|---|
| `state_init` | cursor-state-bridge | Initialize workflow-state document | No |
| `state_set_phase` | cursor-state-bridge | Advance to next phase | No |
| `state_update_acceptance_criterion` | cursor-state-bridge | Record criterion pass/fail | No |
| `state_record_failure` | cursor-state-bridge | Log phase failure | No |
| `state_history_append` | cursor-state-bridge | Append run notes | No |
| `state_read` | cursor-state-bridge | Read current state | No |

MCP bridge is opt-in via `node --experimental-strip-types scripts/install-local-plugin.ts --with-mcp`. When the bridge is not installed, the skill still reads workflow-state and reports the next structured update the user or host should apply; it does not authorize direct JSON edits from an agent.

## Hook dependencies

| Hook Event | Script | Purpose |
|---|---|---|
| `postToolUse` | `state-watcher.ts` | Observes tool execution, validates schema (read-only) |
| `stop` | `stop-gate.ts` | Reads current phase before session stop |
| `preCompact` | `compact-reminder.ts` | Reminds user of current phase before compacting |

Hooks are read-only observers; they do not write workflow-state directly.
