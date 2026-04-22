# References

Access date for web sources: **2026-04-22**.

This page is the citation index for public `oh-my-cursor` claims. It separates
repo-owned proof from host-product documentation so repo wording does not drift
past its evidence.

## Primary official Cursor sources

| Source | Supports which claim family here | Ownership / proof ceiling used by this repo |
| --- | --- | --- |
| [Cursor rules / `AGENTS.md`](https://docs.cursor.com/en/context) | Root `AGENTS.md` and `.cursor/rules` as official instruction surfaces. | Supports `repo-owned` instruction wording at `official-doc`, which this repo strengthens to `checked-in-artifact` only because the files are present and validated locally. |
| [Using Agent in Cursor CLI](https://docs.cursor.com/en/cli/using) | Cursor CLI reads root `AGENTS.md` / `.cursor/rules`, supports MCP, and behaves as a CLI workspace consumer of repo guidance. | Supports `host-product-only` CLI-behavior wording and repo guidance consumption at `official-doc`. |
| [Model Context Protocol (MCP) for CLI](https://docs.cursor.com/cli/mcp) | Cursor/CLI MCP support, configuration sources, and CLI MCP commands. | Supports `host-product-only` MCP wording at `official-doc`; this repo still does not claim a default repo-owned `.cursor/mcp.json`. |
| [Modes](https://docs.cursor.com/chat/custom-modes) | Agent/Ask/Manual/Custom modes as product capabilities and product-managed configuration. | Supports `host-product-only` mode wording at `official-doc`; this repo does not claim repo-file custom-mode packaging. |
| [Background Agents](https://docs.cursor.com/background-agents) | Background agents as asynchronous remote product capability. | Supports `host-product-only` background-agent wording at `official-doc`; this repo does not claim repo-file provisioning. |
| [Plugins, Sandbox Access Controls, and Async Subagents](https://cursor.com/changelog/2-5) | Product awareness for plugins and async subagents, including the surrounding feature family that informs this repo's minimal plugin promotion. | Used for product-awareness and proof ceilings only: this repo treats its repo-root plugin as `repo-owned` only when local checked-in artifacts and validators back the claim. |

## Landing-surface deployment references

| Source | Supports which claim family here | Ownership / proof ceiling used by this repo |
| --- | --- | --- |
| [Next.js static exports](https://nextjs.org/docs/app/building-your-application/deploying/static-exports) | `output: 'export'` builds static assets into `out/` for App Router projects. | Supports the deployment mechanics for a future checked-in `apps/cursor-backbone-site/`; repo-owned wording still requires the files and exported output to exist locally. |
| [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) | Official `configure-pages`, `upload-pages-artifact`, and `deploy-pages` workflow path for Pages deployments. | Supports workflow-shape checks for a future repo-owned landing site; it does not by itself prove the repo already ships that workflow. |

## Claim mapping used by this repo

- Root `AGENTS.md`, `.cursor/rules`, the repo-root plugin manifest, shipped
  plugin rules/skills, local validators, and checked-in benchmark artifacts are
  the strongest current **repo-owned** surfaces.
- Cursor CLI, MCP, modes, and background agents are real Cursor capabilities,
  but they remain **host-product-only** unless this repo deliberately ships and
  validates a corresponding checked-in surface.
- Hook manifests, custom-agent surfaces, repo-file custom-mode packaging, and
  repo-file background-agent provisioning remain
  **unsupported-or-out-of-scope** in this repo today.
- A future checked-in Pages landing site can only be described as
  **repo-owned** after the app files, deploy workflow, and exported-output
  validators all exist in this repo.
- Any stronger public wording must be backed by the matching proof class:
  `official-doc`, `checked-in-artifact`, or `runtime-smoke`.
