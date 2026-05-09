# Claude Code parity matrix

This matrix tracks the practical gap between `oh-my-cursor` and
`oh-my-claudecode`. It is deliberately conservative: conceptual similarity is
not enough for a repo-owned claim. A surface becomes supported here only when a
Cursor-native artifact and proof path exist in this repository.

## Status legend

| Status | Meaning |
| --- | --- |
| Direct local mapping | Cursor ships a native artifact with the same local role. |
| Partial parity | Cursor has a related native artifact, but host semantics or scope differ. |
| Host-product-only | The behavior belongs to Cursor or Claude Code, not this repo. |
| Unsupported here | This repo intentionally does not ship or claim the surface. |
| Candidate port | Worth considering after artifact, proof, and validator are designed. |

## Surface matrix

| Surface family | Claude Code / OMC reference point | Current Cursor artifact | Status | Proof path / next step |
| --- | --- | --- | --- | --- |
| Root policy | `CLAUDE.md`, `AGENTS.md`, OMC operating instructions | `AGENTS.md`, `.cursor/rules/*.md` | Direct local mapping | Existing checked-in files and structure validators. |
| Orchestrator | Sisyphus / Atlas orchestration | `agents/orchestrator.md`, `skills/phase-controller/SKILL.md` | Partial parity | Keep Cursor lifecycle state authoritative. |
| Research | Explore / Librarian agents | `agents/researcher.md`, research portions of `parallel-batch` and `deep-interview` | Partial parity | Do not claim remote-doc lookup behavior unless a Cursor-owned skill/tool implements it. |
| Planning | Prometheus, ralplan, planner, architect, critic | `agents/planner.md`, `skills/plan/`, `skills/deep-interview/` | Partial parity | Consensus planning is a candidate port only with local artifacts. |
| Implementation | executor, Sisyphus-Junior, autopilot | `agents/implementer.md`, `skills/auto-execute/`, `skills/iterate-loop/` | Partial parity | Cursor stop gates and workflow-state transitions define the local contract. |
| Code review | review-work, code-reviewer | `agents/code-reviewer.md`, `skills/review/` | Partial parity | Severity-rated feedback tied to workflow-state acceptance criteria. |
| Verification | verifier, review-work, ultraqa | `agents/verifier.md`, `skills/review/`, local validators under `scripts/` | Partial parity | Add runtime smokes per feature before claiming stronger proof. |
| Review / critique | Oracle, Momus, critic, code-reviewer | `agents/critic.md`, `agents/security-reviewer.md` | Partial parity | Oracle/Momus remain OMC concepts unless Cursor-native prompts are added. |
| Debug / trace | debugger, tracer, trace skill | `agents/debugger.md`, `skills/debug/`, `skills/trace/` | Partial parity | Trace output must stay in Cursor-owned paths. |
| Security review | security-reviewer | `agents/security-reviewer.md`, `skills/security-review/` | Partial parity | Findings must cite local files and validators. |
| Slash commands | `/oh-my-claudecode:*`, `/ralph`, `/ultrawork`, `/review-work` | Cursor skills and agents, no Claude Code slash-command runtime | Unsupported here | Document conceptual mappings only; do not claim execution. |
| Skills registry | OMC plugin skills | `skills/*/SKILL.md` | Partial parity | Port one skill at a time with local proof. |
| Hooks | Claude Code hook lifecycle and OMC hook behaviors | `hooks/hooks.json`, `hooks/*.py` | Partial parity | Cursor hook events are host-specific and already checked in. |
| State | `.omc/state/`, notepad, memory, wiki, trace, session state | `.cursor/state/workflow-state.json`, `active-role.json` | Partial parity | State systems remain independent; no `.omc/state` coupling. |
| MCP | OMC MCP/tooling surfaces | `mcp/cursor-state-bridge/` | Partial parity | Cursor bridge is intentionally narrow and state-focused. |
| Team mode | Claude Code / OpenCode team runtime | None beyond conceptual `parallel-batch` skill | Unsupported here | Candidate only if Cursor exposes equivalent project-owned runtime hooks. |
| Multi-model routing | OMC category/model routing | None | Host-product-only / unsupported here | Avoid provider claims unless Cursor-owned config and docs support them. |
| Install / doctor | OMC setup, doctor, plugin install | `scripts/install-local-plugin.sh`, `skills/local-plugin-check/`, `skills/doctor/` | Partial parity | Cursor install proof stops at local plugin artifacts and user-guided host steps. |
| Sync / migration | OMC migration and sync docs | This matrix plus bridge spec | Candidate port | Add migration docs only after specific workflows are selected. |

## High-value candidate ports

These are the safest gaps to close next because they have clear Cursor analogs:

1. **Consensus planning lane** — extend `skills/plan/` with a Cursor-native
   planner/critic/verifier handoff. Proof: prompt files plus a structure
   validator that verifies required sections.
2. **Review-work style QA lane** — extend `skills/review/` to require separate
   verifier/security-reviewer evidence before completion. Proof: workflow-state
   acceptance criteria and validator checks.
3. **Trace/debug report format** — align `skills/trace/` and `skills/debug/`
   around a shared evidence template. Proof: checked-in skill docs and example
   trace artifact.
4. **Doctor/local-plugin check parity** — expand `skills/doctor/` to report
   Cursor-owned files, optional MCP install state, and known host-product-only
   gaps. Proof: local script output and docs.
5. **Bridge reference index** — maintain a generated or hand-curated table from
   OMC concepts to Cursor artifacts. Proof: this file plus links from README and
   orchestration docs.

## Explicit non-goals

- Do not create a shared core package until repeated ports prove stable overlap.
- Do not parse, mutate, or validate `.omc/state/*`.
- Do not rename Cursor agents or skills solely to match OMC names.
- Do not claim Claude Code slash commands work in Cursor.
- Do not add broad MCP tools just to match OMC breadth; keep MCP state-focused
  unless a concrete Cursor workflow needs more.

## Maintenance rule

When a row moves from `Partial parity` or `Candidate port` to `Direct local
mapping`, the same change must update:

1. the relevant Cursor artifact;
2. its docs entry;
3. a validator or runtime-smoke path; and
4. [`references.md`](./references.md) when the public claim depends on host or
   upstream documentation.
