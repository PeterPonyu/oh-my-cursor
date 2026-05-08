# References

Access date for web references: **2026-05-06**.

This page is the citation index for public `oh-my-cursor` claims. It separates
repo-owned proof from host-product documentation so repo wording does not drift
past its evidence.

When capability claims change in `AGENTS.md`, `README.md`, `docs/**`, or
`.cursor/rules/**`, this file must be updated in the same change.

## Primary official Cursor references

| Reference | Supports which claim family here | Ownership / proof ceiling used by this repo |
| --- | --- | --- |
| [Cursor rules / `AGENTS.md`](https://docs.cursor.com/en/context) | Root `AGENTS.md` and `.cursor/rules/` as official instruction surfaces. | Supports `repo-owned` instruction wording at `official-doc`, strengthened to `checked-in-artifact` only because the files are present and validated locally. |
| [Using Agent in Cursor CLI](https://docs.cursor.com/en/cli/using) | Cursor CLI reads root `AGENTS.md` / `.cursor/rules`, supports MCP, and behaves as a CLI workspace consumer of repo guidance. | Supports `host-product-only` CLI behavior and repo guidance consumption at `official-doc`. |
| [Plugins](https://cursor.com/docs/plugins) | Plugin installation, local development via `~/.cursor/plugins/local`, and high-level plugin packaging behavior. | Supports the local plugin walkthrough and product-level plugin behavior; checked-in repo ownership still requires local artifacts and validators. |
| [Plugins Reference](https://cursor.com/docs/reference/plugins) | Plugin manifest shape and references to rules, skills, agents, and hooks. | Supports `.cursor-plugin/plugin.json` and its explicit component references at `official-doc`, strengthened to `checked-in-artifact` because those paths exist locally. |
| [Hooks](https://docs.cursor.com/en/agent/hooks) | Project hook configuration at `.cursor/hooks.json`, trusted-workspace execution, and event-driven hook behavior. | Supports project-hook wording at `official-doc`, strengthened only to `checked-in-artifact` for the manifest and scripts in this repo. |
| [Subagents](https://docs.cursor.com/en/agent/subagents) | Project agents under `.cursor/agents/*.md` with YAML frontmatter. | Supports project-agent wording at `official-doc`, strengthened to `checked-in-artifact` because the agent files are present and validated locally. |
| [Skills](https://docs.cursor.com/en/agent/skills) | Skills as reusable Cursor workflow instructions. | Supports checked-in `skills/**/SKILL.md` wording at `official-doc`, strengthened to `checked-in-artifact` for files present in this repo. |
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

- Root `AGENTS.md`, `.cursor/rules/`, `.cursor/hooks.json`, `.cursor/hooks/`,
  `.cursor/agents/`, the repo-root plugin manifest, shipped rules/skills,
  checked-in brand/readme/social assets under `assets/`, the root README image,
  local validators, and checked-in benchmark artifacts are current
  **repo-owned** surfaces.
- Cursor CLI, MCP, custom modes, and background agents are real Cursor
  capabilities, but they remain **host-product-only** unless this repo ships and
  validates a corresponding checked-in surface.
- `oh-my-claudecode` concepts referenced by the bridge docs are integration
  targets, not Cursor-owned behavior; parity claims stay bounded by the local
  mapping documents and checked-in Cursor artifacts.
- Repo-file custom-mode packaging, repo-file background-agent provisioning, a
  default MCP config, and marketplace publication remain outside the
  current repo contract.
- Any stronger public wording must be backed by the matching proof class:
  `official-doc`, `checked-in-artifact`, or `runtime-smoke`.
