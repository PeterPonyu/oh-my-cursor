# External runtime bridge

This document defines the safe bridge between `oh-my-cursor` and external user
asset families such as Claude Code / OMC and Codex-side skills. It is a mapping
contract, not a shared runtime. Cursor, Claude Code, and Codex expose different
host surfaces, so this repo claims support only where a checked-in Cursor
artifact and validator exist.

## Scope

The bridge is intentionally narrow:

- describe how Cursor-native agents, skills, hooks, state, and MCP surfaces map
  to comparable external workflow concepts;
- preserve the `.cursor/state/` ownership model described in
  [`state-boundaries.md`](./state-boundaries.md);
- identify which gaps are direct local mappings, partial compatibility,
  intentionally unsupported, or host-product-only; and
- give maintainers a proof checklist before porting an external workflow into
  this repo.

The bridge does **not** read or write external runtime state such as
`.omc/state/` or `.codex/`, install upstream plugins, invoke non-Cursor agents,
or claim that Claude Code-only or Codex-only commands execute in Cursor. Those
remain outside this repo unless a concrete Cursor-owned artifact and validator
land together.

## User Compatibility Assets

Cursor's official skills and subagents documentation describes compatibility
directories for both Claude and Codex user assets. Treat those directories as
peer **host-product-discovered user assets** when they exist:

| Family | User-level compatibility directories | Repo stance |
| --- | --- | --- |
| Claude Code / OMC | `~/.claude/skills/`, `~/.claude/agents/` | Cursor may discover compatible skills/agents from these locations; this repo does not own their content or runtime state. |
| Codex-side user assets | `~/.codex/skills/`, `~/.codex/agents/` | Cursor may discover compatible skills/agents from these locations; this repo does not own their content or runtime state. |
| OMCS / Cursor plugin | `~/.cursor/plugins/local/oh-my-cursor`, checked-in `skills/`, `agents/`, `rules/`, `hooks/` | Repo-owned when installed from this repository and validated by local scripts. |

This is not an OMC-vs-Codex comparison. It is a Cursor discovery rule: when
Cursor documents multiple compatibility directories, `oh-my-cursor` should
recognize them symmetrically while keeping ownership separate. External assets
remain user/upstream-owned; OMCS is the checked-in Cursor plugin surface.

If an OMC installation stores assets only in a plugin cache such as
`~/.claude/plugins/cache/omc/oh-my-claudecode/<version>/`, use
`node --experimental-strip-types scripts/link-omc-cursor-compat-assets.ts --force` to materialize prefixed
copies into Cursor's documented Claude compatibility directories. The helper
does not mutate the OMC cache; it creates `[OMC]` user skills under
`~/.claude/skills/` and OMC-prefixed agents under `~/.claude/agents/` so Cursor
CLI can discover them through the same host-product mechanism used for
Codex-side assets under `~/.codex/`.

The `[OMC]` prefix and the `~/.claude/` target are deliberate. The prefix marks
**provenance** — these are foreign oh-my-claudecode assets surfaced verbatim, so
they intentionally keep the source `[OMC]` tag rather than this port's `[OMCS]`,
which would falsely claim them as Cursor-port-owned. Writing into `~/.claude/`
(not a `.cursor/`-scoped path) is intentional cross-tool interop: those are
Cursor's officially-documented Claude-compatibility discovery directories.

## Ownership and Proof Classes

| Bridge surface | Ownership class here | Strongest proof here | Rule |
| --- | --- | --- | --- |
| Cursor equivalents checked into this repo | `repo-owned` | `checked-in-artifact` | Claim only what local files and validators prove. |
| External skills/agents loaded from documented compatibility directories | `host-product-only` or upstream-owned | `official-doc` for discovery; upstream artifact for content | Treat Claude and Codex compatibility directories equivalently as user assets; do not treat either as repo-owned OMCS content. |
| External runtime behavior, commands, plugin install, and private state internals | `host-product-only` or upstream-owned | `official-doc` or upstream artifact | Mention only as integration targets; do not treat as repo-owned. |
| Cross-runtime state mutation | `unsupported-or-out-of-scope` | N/A | Do not write `.omc/state/`, `.codex/`, or other external runtime state from Cursor hooks, agents, skills, or MCP tools. |
| New ports from external workflows | `repo-owned` only after artifact + validator | `checked-in-artifact`; `runtime-smoke` when env-gated smoke exists | Add docs, files, and validation in the same change. |

## Lifecycle Crosswalk

| `oh-my-cursor` phase | Closest external concept | Bridge status | Notes |
| --- | --- | --- | --- |
| `intake` | request classification, intent gate, skill selection | Partial compatibility | Cursor owns phase state; external runtimes own their prompt policy. |
| `research` | exploration and background context gathering | Partial compatibility | Cursor ships `researcher` and research-oriented skills, but does not invoke external subagents directly. |
| `plan` | planner / architect / critic plan synthesis | Partial compatibility | Cursor has `planner` plus `plan` and `deep-interview` skills; consensus machinery is not claimed unless implemented locally. |
| `execute` | executor / autopilot loops | Partial compatibility | Cursor has `orchestrator`, `implementer`, `auto-execute`, and `iterate-loop`; external slash-command semantics are host-specific. |
| `verify` | verifier / QA lane | Partial compatibility | Cursor has `verifier`, `test-engineer`, `review`, and local validators; end-to-end external verification commands are not repo-owned. |
| `review` | critic / code-reviewer / security-reviewer | Partial compatibility | Cursor ships local reviewer agents; findings must cite local evidence. |
| `done` | completion gate / session summary | Direct local mapping | Cursor records completion in workflow-state and hook summaries. |
| `blocked` | stop gate / clarification / failure routing | Direct local mapping | Cursor models `blocked` explicitly through workflow-state and hooks. |

## State and MCP Boundary

Cursor state remains independent from external runtime state:

- `.cursor/state/workflow-state.json` is the Cursor workflow contract.
- `.omc/state/*` and `.codex/` runtime state remain opaque.
- `cursor-state-bridge` may write only Cursor workflow state through schema
  tools.
- A future bridge reader may summarize external concepts only from documented
  public artifacts; it must not parse private runtime state layouts.

## Porting Checklist

Before porting an external workflow into `oh-my-cursor`, answer all of these:

1. Which Cursor-owned file, hook, agent, skill, state field, or MCP tool will
   carry the behavior?
2. Which lifecycle phase owns it?
3. What proof class supports the public wording?
4. Which validator or smoke test fails if the port regresses?
5. Does the port avoid reading or writing external runtime state?
6. Does the port preserve Cursor host boundaries instead of claiming
   non-Cursor slash-command behavior?

If any answer is missing, keep the gap documented in
[`external-runtime-compatibility.md`](./external-runtime-compatibility.md)
instead of shipping behavior.
