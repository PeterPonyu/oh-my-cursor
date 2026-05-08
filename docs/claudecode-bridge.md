# Claude Code bridge

This document defines the safe bridge between `oh-my-cursor` and the user's
global `oh-my-claudecode` harness. It is a mapping contract, not a shared
runtime. Cursor and Claude Code expose different host surfaces, so this repo
claims parity only where a checked-in Cursor artifact exists.

## Scope

The bridge is intentionally narrow:

- describe how Cursor-native agents, skills, hooks, state, and MCP surfaces map
  to comparable `oh-my-claudecode` concepts;
- preserve the `.cursor/state/` ownership model described in
  [`state-boundaries.md`](./state-boundaries.md);
- identify which gaps are direct parity, partial parity, intentionally
  unsupported, or host-product-only; and
- give maintainers a proof checklist before porting a Claude Code workflow into
  this repo.

The bridge does **not** read or write `.omc/state/`, install Claude Code
plugins, invoke Claude Code agents, or claim that Cursor can execute Claude
Code-only slash commands. Those remain outside this repo unless a concrete
Cursor-owned artifact and validator land together.

## Ownership and proof classes

| Bridge surface | Ownership class here | Strongest proof here | Rule |
| --- | --- | --- | --- |
| Cursor equivalents checked into this repo | `repo-owned` | `checked-in-artifact` | Claim only what local files and validators prove. |
| Claude Code behavior, commands, plugin install, and `.omc/state/` internals | `host-product-only` or upstream-owned | `official-doc` or upstream artifact | Mention only as an integration target; do not treat as repo-owned. |
| Cross-runtime state mutation | `unsupported-or-out-of-scope` | N/A | Do not write `.omc/state/` from Cursor hooks, agents, skills, or MCP tools. |
| New ports from Claude Code workflows | `repo-owned` only after artifact + validator | `checked-in-artifact`; `runtime-smoke` when env-gated smoke exists | Add docs, files, and validation in the same change. |

## Lifecycle crosswalk

| `oh-my-cursor` phase | Closest Claude Code / OMC concept | Bridge status | Notes |
| --- | --- | --- | --- |
| `intake` | request classification, intent gate, skill selection | Partial parity | Cursor owns phase state; OMC owns its prompt policy. |
| `research` | Explore/Librarian discovery and background context gathering | Partial parity | Cursor ships `researcher` and research-oriented skills, but does not invoke OMC subagents directly. |
| `plan` | Prometheus / planner / ralplan-style plan synthesis | Partial parity | Cursor has `planner` plus `plan` and `deep-interview` skills; consensus machinery is not claimed unless implemented locally. |
| `execute` | Sisyphus/Atlas executor workflows | Partial parity | Cursor has `orchestrator`, `implementer`, `auto-execute`, and `iterate-loop`; Claude Code slash-command semantics are host-specific. |
| `verify` | verifier / ultraqa / review-work checks | Partial parity | Cursor has `verifier`, `review`, and local validators; end-to-end Claude Code verification commands are not repo-owned. |
| `review` | critic / Oracle / code-reviewer / security-reviewer | Partial parity | Cursor ships `critic` and `security-reviewer`; Oracle is an OMC read-only consultant, not a Cursor-owned agent. |
| `done` | completion gate / session summary | Direct local mapping | Cursor records completion in workflow-state and hook summaries. |
| `blocked` | stop gate / clarification / failure routing | Direct local mapping | Cursor models `blocked` explicitly through workflow-state and hooks. |

## Agent crosswalk

| Cursor agent | Comparable OMC role | Bridge status | Porting guidance |
| --- | --- | --- | --- |
| `orchestrator` | Sisyphus / Atlas | Partial parity | Keep Cursor orchestration prompt local; do not import Claude prompt text wholesale. |
| `researcher` | Explore / Librarian | Partial parity | Preserve Cursor tool allowlists and proof ceilings. |
| `planner` | Prometheus / planner / ralplan | Partial parity | Use Cursor lifecycle phases instead of OMC internal state. |
| `implementer` | executor / Sisyphus-Junior | Partial parity | Only claim repo-owned execution patterns that are checked in. |
| `verifier` | verifier / review-work QA lane | Partial parity | Prefer local validators and runtime smokes over borrowed claims. |
| `critic` | critic / Momus-style plan review | Partial parity | Keep criticism read-oriented unless the workflow explicitly requests edits. |
| `debugger` | debugger / tracer | Partial parity | Debugging semantics can map conceptually; tool permissions remain Cursor-native. |
| `security-reviewer` | security-reviewer | Partial parity | Security review can be conceptually aligned, but findings must cite local evidence. |

## Skill crosswalk

| Cursor skill | Comparable OMC workflow | Bridge status | Notes |
| --- | --- | --- | --- |
| `phase-controller` | todo-driven phase management | Direct local mapping | Cursor's workflow-state is the source of truth. |
| `plan` | omc-plan / ralplan | Partial parity | Consensus planning is not claimed unless implemented locally. |
| `deep-interview` | deep-interview | Partial parity | Same intent, Cursor-owned prompt and lifecycle. |
| `parallel-batch` | team / ultrawork / parallel exploration | Partial parity | Cursor does not claim Claude Code team runtime. |
| `auto-execute` | autopilot / ralph / executor loops | Partial parity | Must respect Cursor stop gates and state writes. |
| `iterate-loop` | ralph / ultrawork loops | Partial parity | Cursor loop state is schema-bounded. |
| `review` | review-work / verifier | Partial parity | Local validators remain the proof surface. |
| `debug` | debug / trace | Partial parity | Do not rely on OMC trace files. |
| `trace` | trace / tracer | Partial parity | Trace artifacts must live in Cursor-owned paths. |
| `security-review` | security-reviewer | Partial parity | Keep evidence local. |
| `doctor` | omc-doctor / setup checks | Partial parity | Cursor doctoring covers Cursor artifacts only. |
| `local-plugin-check` | local plugin install verification | Direct local mapping | Cursor plugin loading remains host-product-only past checked-in files. |

## State and MCP boundary

Cursor state remains independent from OMC state:

- `.cursor/state/workflow-state.json` is the Cursor workflow contract.
- `.omc/state/*` is upstream OMC runtime state and remains opaque.
- `cursor-state-bridge` may write only Cursor workflow state through its schema
  tools.
- A future bridge reader may summarize OMC concepts only from documented public
  artifacts; it must not parse private `.omc/state` layouts.

## Porting checklist

Before porting an OMC workflow into `oh-my-cursor`, answer all of these:

1. Which Cursor-owned file, hook, agent, skill, state field, or MCP tool will
   carry the behavior?
2. Which lifecycle phase owns it?
3. What proof class supports the public wording?
4. Which validator or smoke test fails if the port regresses?
5. Does the port avoid reading or writing `.omc/state/`?
6. Does the port preserve Cursor host boundaries instead of claiming Claude
   Code-only slash-command behavior?

If any answer is missing, keep the gap documented in
[`claudecode-parity-matrix.md`](./claudecode-parity-matrix.md) instead of
shipping behavior.
