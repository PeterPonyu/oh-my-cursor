# External runtime compatibility matrix

This matrix tracks the practical gap between `oh-my-cursor` and external user
asset families such as Claude Code / OMC and Codex-side skills. It is
deliberately conservative: conceptual similarity is not enough for a repo-owned
claim. A surface becomes supported here only when a Cursor-native artifact and
proof path exist in this repository.

## Status Legend

| Status | Meaning |
| --- | --- |
| Direct local mapping | Cursor ships a native artifact with the same local role. |
| Partial compatibility | Cursor has a related native artifact, but host semantics or scope differ. |
| Host-product-only | The behavior belongs to Cursor or an external runtime, not this repo. |
| Unsupported here | This repo intentionally does not ship or claim the surface. |
| Candidate port | Worth considering after artifact, proof, and validator are designed. |

## Surface Matrix

| Surface family | External reference point | Current Cursor artifact | Status | Proof path / next step |
| --- | --- | --- | --- | --- |
| Root policy | `CLAUDE.md`, `AGENTS.md`, external operating instructions | `AGENTS.md`, `.cursor/rules/*.md` | Direct local mapping | Existing checked-in files and structure validators. |
| Orchestrator | Sisyphus / Atlas-style orchestration | `agents/orchestrator.md`, `skills/phase-controller/SKILL.md` | Partial compatibility | Keep Cursor lifecycle state authoritative. |
| Research | Explore / Librarian agents | `agents/researcher.md`, research portions of `parallel-batch` and `deep-interview` | Partial compatibility | Do not claim remote-doc lookup behavior unless a Cursor-owned skill/tool implements it. |
| Planning | Planner, architect, critic, ralplan-style loops | `agents/planner.md`, `skills/plan/`, `skills/deep-interview/` | Partial compatibility | Consensus planning is a candidate port only with local artifacts. |
| Implementation | Executor, autopilot, ralph-style loops | `agents/implementer.md`, `skills/auto-execute/`, `skills/iterate-loop/` | Partial compatibility | Cursor stop gates and workflow-state transitions define the local contract. |
| Code review | review-work, code-reviewer | `agents/code-reviewer.md`, `skills/review/` | Partial compatibility | Severity-rated feedback tied to workflow-state acceptance criteria. |
| Verification | verifier, QA lane, ultraqa-style loops | `agents/qa-tester.md`, `agents/verifier.md`, `agents/test-engineer.md`, `skills/review/`, local validators under `scripts/` | Partial compatibility | Add runtime smokes per feature before claiming stronger proof. |
| Review / critique | Oracle, Momus, critic, code-reviewer | `agents/critic.md`, `agents/security-reviewer.md` | Partial compatibility | External reviewer personas remain external unless Cursor-native prompts are added. |
| Debug / trace | debugger, tracer, trace skill | `agents/debugger.md`, `skills/debug/`, `skills/trace/` | Partial compatibility | Trace output must stay in Cursor-owned paths. |
| Security review | security-reviewer | `agents/security-reviewer.md`, `skills/security-review/` | Partial compatibility | Findings must cite local files and validators. |
| Slash commands | `/ralph`, `/ultrawork`, `/review-work`, and other external commands | Cursor skills and agents, no external slash-command runtime | Unsupported here | Document conceptual mappings only; do not claim execution. |
| Skills registry | Claude and Codex user skills | `skills/*/SKILL.md` plus host-discovered compatibility directories | Partial compatibility | Treat `~/.claude/skills/` and `~/.codex/skills/` as peer user-asset sources; use `scripts/link-omc-cursor-compat-assets.ts` when OMC assets exist only in a Claude plugin cache; port one skill at a time into OMCS only with local proof. |
| Hooks | External hook lifecycle and behaviors | `hooks/hooks.json`, `hooks/*.ts` | Partial compatibility | Cursor hook events are host-specific and already checked in. |
| State | `.omc/state/`, `.codex/` runtime state, notepad, memory, wiki, trace, session state | `.cursor/state/workflow-state.json`, `active-role.json` | Partial compatibility | State systems remain independent; no `.omc/state` or `.codex/` coupling. |
| MCP | External MCP/tooling surfaces | `mcp/cursor-state-bridge/` | Partial compatibility | Cursor bridge is intentionally narrow and state-focused. |
| Team mode | External team runtime | None beyond conceptual `parallel-batch` skill | Unsupported here | Candidate only if Cursor exposes equivalent project-owned runtime hooks. |
| Multi-model routing | External category/model routing | None | Host-product-only / unsupported here | Avoid provider claims unless Cursor-owned config and docs support them. |
| Install / doctor | External setup, doctor, plugin install | `scripts/install-local-plugin.ts`, `skills/local-plugin-check/`, `skills/doctor/` | Partial compatibility | Cursor install proof stops at local plugin artifacts and user-guided host steps. |
| Sync / migration | External migration and sync docs | This matrix plus bridge spec | Candidate port | Add migration docs only after specific workflows are selected. |

## High-Value Candidate Ports

These are the safest gaps to close next because they have clear Cursor analogs:

1. **Consensus planning lane** — extend `skills/plan/` with a Cursor-native
   planner/critic/verifier handoff. Proof: prompt files plus a structure
   validator that verifies required sections.
2. **Review-work style QA lane** — extend `skills/review/` to require separate
   verifier/security-reviewer evidence before completion. Proof:
   workflow-state acceptance criteria and validator checks.
3. **Trace/debug report format** — align `skills/trace/` and `skills/debug/`
   around a shared evidence template. Proof: checked-in skill docs and example
   trace artifact.
4. **Doctor/local-plugin check compatibility** — expand `skills/doctor/` to
   report Cursor-owned files, optional MCP install state, and known
   host-product-only gaps. Proof: local script output and docs.
5. **Bridge reference index** — maintain a generated or hand-curated table from
   external concepts to Cursor artifacts. Proof: this file plus links from
   README and orchestration docs.
6. **OMC compatibility materialization** — keep
   `scripts/link-omc-cursor-compat-assets.py` aligned with Cursor's documented
   `~/.claude/skills/` and `~/.claude/agents/` lookup paths. Proof:
   `scripts/e2e-qa-session-assets.sh` with `CHECK_USER_COMPAT_ASSETS=1`.

## Explicit Non-Goals

- Do not create a shared core package until repeated ports prove stable overlap.
- Do not parse, mutate, or validate `.omc/state/*` or `.codex/` runtime state.
- Do not rename Cursor agents or skills solely to match external names.
- Do not claim non-Cursor slash commands work in Cursor.
- Do not add broad MCP tools just to match another runtime's breadth; keep MCP
  state-focused unless a concrete Cursor workflow needs more.

## Maintenance Rule

When a row moves from `Partial compatibility` or `Candidate port` to `Direct
local mapping`, the same change must update:

1. the relevant Cursor artifact;
2. its docs entry;
3. a validator or runtime-smoke path; and
4. [`references.md`](./references.md) when the public claim depends on host or
   upstream documentation.
