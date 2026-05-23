# References

Access date for web references: **2026-05-23**.

This page is the citation index for public `oh-my-cursor` claims. It separates
repo-owned proof from host-product documentation so repo wording does not drift
past its evidence.

When capability claims change in `AGENTS.md`, `README.md`, `docs/**`, or
`.cursor/rules/**`, this file must be updated in the same change.

## Primary official Cursor references

| Reference | Supports which claim family here | Ownership / proof ceiling used by this repo |
| --- | --- | --- |
| [Cursor rules / `AGENTS.md`](https://docs.cursor.com/en/context) | Root `AGENTS.md` and `.cursor/rules/` as official instruction surfaces. | Supports `repo-owned` instruction wording at `official-doc`, strengthened to `checked-in-artifact` only because the files are present and validated locally. |
| [Using Agent in Cursor CLI](https://cursor.com/docs/cli/using.md) | Cursor CLI reads root `AGENTS.md` / `.cursor/rules`, supports MCP, supports `--resume` / `--continue`, and behaves as a CLI workspace consumer of repo guidance. | Supports `host-product-only` CLI behavior, resume behavior, and repo guidance consumption at `official-doc`. |
| [Cursor CLI parameters](https://cursor.com/docs/cli/reference/parameters.md) | Cursor CLI flags including `--model`, `--plugin-dir`, `--workspace`, `--print`, `--trust`, `--approve-mcps`, and `--worktree`. | Supports CLI-driver examples at `official-doc`; this repo only documents how to invoke the host product with checked-in plugin artifacts. |
| [Composer 2.5](https://cursor.com/docs/models/cursor-composer-2-5.md) | Composer 2.5 is Cursor's agentic model, tuned for long tasks, tool use, file edits, and terminal operations. | Supports host-product-only wording about choosing Composer 2.5 as a parent CLI model when available; checked-in agents still stay `model: auto` without benchmark proof. |
| Legacy Cursor CLI source alias | `https://docs.cursor.com/en/cli/using` | Retained as a validator compatibility alias for the current CLI docs above. |
| [Plugins](https://cursor.com/docs/plugins) | Plugin installation, local development via `~/.cursor/plugins/local`, and high-level plugin packaging behavior for repo-root or built payload installs. | Supports the local plugin walkthrough and product-level plugin behavior; checked-in repo ownership still requires local artifacts and validators. |
| [Orchestrator Role](../agents/orchestrator.md) | State management and phase routing. | Supports `repo-owned` orchestrator behavior and documents the broadest workflow-state write access among checked-in agents. |
| [Planner Role](../agents/planner.md) | Task planning and acceptance criteria generation. | Supports `repo-owned` planner behavior. Planner is `readonly: true` and does NOT own phase advancement. |
| [Plugins Reference](https://cursor.com/docs/reference/plugins) | Plugin manifest shape and references to rules, skills, agents, and hooks. | Supports `.cursor-plugin/plugin.json` and its explicit component references at `official-doc`, strengthened to `checked-in-artifact` because those paths exist locally. |
| [Hooks](https://docs.cursor.com/en/agent/hooks) | Hook configuration, trusted-workspace execution, and event-driven hook behavior. | Supports project-hook wording at `official-doc`, strengthened only to `checked-in-artifact` for `hooks/hooks.json` and scripts in this repo. |
| [Subagents](https://docs.cursor.com/en/agent/subagents) | Custom agents/subagents with YAML frontmatter, host-managed execution, role-level model fields, and compatibility lookup in `.claude/agents/`, `.codex/agents/`, `~/.claude/agents/`, and `~/.codex/agents/`. | Supports project-agent wording at `official-doc`, strengthened to `checked-in-artifact` because `agents/*.md` files are present and validated locally. OMCS keeps checked-in agents at `model: auto` unless `docs/agent-model-policy.md` and benchmarks justify pinning; OMC and Codex-side agent directories remain user/upstream assets. |
| [Skills](https://docs.cursor.com/skills.md) | Skills as reusable Cursor workflow instructions, including compatibility lookup in `.claude/skills/`, `.codex/skills/`, `~/.claude/skills/`, and `~/.codex/skills/`. | Supports checked-in `skills/**/SKILL.md` wording at `official-doc`, strengthened to `checked-in-artifact` for files present in this repo; OMC and Codex-side skill directories remain user/upstream assets. |
| [Model Context Protocol (MCP) for CLI](https://docs.cursor.com/cli/mcp) | Cursor/CLI MCP support, configuration references, and CLI MCP commands. | Supports `host-product-only` MCP wording at `official-doc`; this repo still does not claim a default `.cursor/mcp.json`. |
| [Modes](https://docs.cursor.com/chat/custom-modes) | Agent/Ask/Manual/Custom modes as product capabilities and product-managed configuration. | Supports `host-product-only` mode wording at `official-doc`; this repo does not claim repo-file custom-mode packaging. |
| [Background Agents](https://docs.cursor.com/background-agents) | Background agents as asynchronous remote product capability. | Supports `host-product-only` background-agent wording at `official-doc`; this repo does not claim repo-file provisioning. |
| [Model Context Protocol specification](https://spec.modelcontextprotocol.io/) | JSON-RPC 2.0 wire format, `initialize` / `tools/list` / `tools/call` semantics, transport options. | Supports `repo-owned` `checked-in-artifact` wording for the `mcp/cursor-state-bridge/` server's stdio JSON-RPC implementation; runtime smoke evidence is gated by `RUN_MCP_BRIDGE_SMOKE=1`. |

## Landing-surface deployment references

| Reference | Supports which claim family here | Ownership / proof ceiling used by this repo |
| --- | --- | --- |
| [Next.js static exports](https://nextjs.org/docs/app/building-your-application/deploying/static-exports) | `output: 'export'` builds static assets into `out/` for App Router projects. | Supports deployment mechanics for `apps/cursor-backbone-site/`; repo-owned wording still requires checked-in files and exported output validation. |
| [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) | Official `configure-pages`, `upload-pages-artifact`, and `deploy-pages` workflow path for Pages deployments. | Supports workflow-shape checks for the repo-owned landing site when the workflow and app artifacts are present. |

## Claim mapping used by this repo

- Root `AGENTS.md`, `.cursor/rules/`, `hooks/hooks.json`, `hooks/`,
  `agents/`, the repo-root plugin manifest, shipped `rules/` compatibility policy and skills,
  checked-in brand/readme/social assets under `assets/`, the root README image,
  local validators, and optional runtime smokes are current **repo-owned**
  proof surfaces.
- Cursor CLI, MCP, custom modes, and background agents are real Cursor
  capabilities, but they remain **host-product-only** unless this repo ships and
  validates a corresponding checked-in surface.
- External runtime concepts referenced by the bridge docs are integration
  targets, not Cursor-owned behavior; compatibility claims stay bounded by the
  local mapping documents and checked-in Cursor artifacts.
- OMC (`~/.claude/skills`, `~/.claude/agents`) and Codex-side
  (`~/.codex/skills`, `~/.codex/agents`) assets are peer
  **host-product-discovered user assets** when present. OMCS (`oh-my-cursor`)
  remains the repo-owned plugin surface after local install validation.
- `scripts/link-omc-cursor-compat-assets.ts` is a repo-owned local helper that
  copies OMC plugin-cache skills/agents into Cursor-documented Claude
  compatibility directories when the user requests that bridge. Its proof class
  is `checked-in-artifact` plus the opt-in
  `CHECK_USER_COMPAT_ASSETS=1 scripts/e2e-qa-session-assets.ts` smoke.
- Repo-file custom-mode packaging, repo-file background-agent provisioning, a
  default MCP config, and marketplace publication remain outside the
  current repo contract.
- Any stronger public wording must be backed by the matching proof class:
  `official-doc`, `checked-in-artifact`, or `runtime-smoke`.
- Checked-in agent model selection is governed by
  [`agent-model-policy.md`](./agent-model-policy.md). Role-specific model
  pinning requires benchmark evidence; parent CLI model selection uses
  `scripts/resolve-cursor-model.ts` and remains host-product-only.

## Repo-Owned Agents Governance (Access date: 2026-05-19)

| Agent | Ownership Class | Proof Class | MCP Access | Primary Role |
| --- | --- | --- | --- | --- |
| orchestrator | repo-owned | checked-in-artifact | `state_read`, `state_init`, `state_set_phase`, `state_record_failure`, `state_update_acceptance_criterion`, `state_history_append` | Entry point: phase routing + state coordination |
| architect | repo-owned | checked-in-artifact | `state_read` | Plan/review phase: architecture boundary and invariant review |
| researcher | repo-owned | checked-in-artifact | `state_read` | Research phase: fact gathering + gap analysis |
| planner | repo-owned | checked-in-artifact | `state_read` | Plan phase: acceptance criteria + task waves |
| qa-tester | repo-owned | checked-in-artifact | `state_read`, `state_update_acceptance_criterion`, `state_history_append` | Verify phase: bounded runtime QA evidence |
| implementer | repo-owned | checked-in-artifact | `state_read`, `state_set_phase`, `state_update_acceptance_criterion`, `state_history_append` | Execute phase: code changes + scope gates |
| verifier | repo-owned | checked-in-artifact | `state_read`, `state_update_acceptance_criterion` | Verify phase: acceptance criterion validation |
| critic | repo-owned | checked-in-artifact | `state_read` | Review phase: assumption challenge |
| code-reviewer | repo-owned | checked-in-artifact | `state_read` | Review phase: quality + performance review |
| debugger | repo-owned | checked-in-artifact | `state_read`, `state_record_failure`, `state_history_append` | Failure phase: diagnosis + root cause |
| tracer | repo-owned | checked-in-artifact | `state_read`, `state_history_append` | Failure phase: causal investigation |
| security-reviewer | repo-owned | checked-in-artifact | `state_read` | Review phase: security gate |
| explore | repo-owned | checked-in-artifact | `state_read` | Research phase: fast codebase mapping |
| test-engineer | repo-owned | checked-in-artifact | `state_read`, `state_set_phase`, `state_update_acceptance_criterion` | Verify phase: test strategy + coverage |

## MCP Tool Surface — cursor-state-bridge (Access date: 2026-05-19, Verified: repo-owned, checked-in-artifact)

All tools speak JSON-RPC 2.0 over stdio. No network listener. Runs only when explicitly configured.

| Tool | Purpose | Write Scope | Jail Root | Accessible Phases |
| --- | --- | --- | --- | --- |
| state_init | Create workflow-state document | `.cursor/state/workflow-state.json` | `docs/plans/<task-id>/` | intake (orchestrator only) |
| state_set_phase | Advance workflow phase | `phase` field only | `.cursor/state/` | any (research→plan→execute→verify→review→done, +blocked) |
| state_update_acceptance_criterion | Record criterion result (passed/failed) | `acceptance_criteria[].status + .evidence` | `.cursor/state/` | verify/review phases |
| state_record_failure | Record failure metadata (hypothesis, timestamp) | `failure` object | `.cursor/state/` | any phase on error |
| state_history_append | Append run-level notes | `history[]` | `.cursor/state/` | any phase (audit trail) |
| state_read | Read current workflow-state | read-only | `.cursor/state/` | all phases (all agents) |

**Error Handling**: All tools return JSON-RPC 2.0 errors with semantic codes. File lock serializes concurrent writes; CLI and MCP bridge share the same packaged lock via `src/oh_my_cursor/workflow_state/locking.ts`.

**Token-based Auth** (optional): Not implemented in baseline. Future scope: JWTs for remote agent invocation.

**Validator Integration**: `scripts/validate-mcp-server-structure.ts` proves package well-formedness. Smoke test: `scripts/smoke-mcp-cursor-state-bridge.ts` (gated by `RUN_MCP_BRIDGE_SMOKE=1`).

## Third-party recipe references (Access date: 2026-05-23)

| Reference | Purpose in Recipes | Link |
| --- | --- | --- |
| Exa MCP Server | Semantic web search integration details | [exa/mcp-server](https://github.com/exa-labs/exa-mcp-server) |
| Context7 MCP Server | Documentation search integration details | [context7/mcp-server](https://github.com/context7/mcp-server) |
| Grep.app MCP Server | GitHub public code search integration | [grep-app/mcp-server](https://github.com/grep-app/mcp-server) |
| AST-Grep | Structural search and refactoring patterns | [ast-grep](https://ast-grep.github.io/) |
