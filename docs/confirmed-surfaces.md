# Confirmed Cursor-native surfaces

As of **2026-05-20**, this repository backbone distinguishes three classes of
truth:

- **repo-owned** — checked-in surfaces this repo ships and validates;
- **host-product-only** — Cursor product capabilities documented by Cursor, but
  not provisioned by this repo as checked-in files; and
- **unsupported-or-out-of-scope** — product-adjacent surfaces this repo does not
  currently ship or claim.

## Ownership and proof map

| Outcome family | Ownership class | Strongest proof class used here | Current repo position |
| --- | --- | --- | --- |
| Root instructions and policy | `repo-owned` | `checked-in-artifact` | This repo ships one root `AGENTS.md` and `.cursor/rules/` guidance. |
| Project hooks | `repo-owned` in trusted Cursor workspaces | `checked-in-artifact` for files, stronger only with runtime evidence | This repo ships `hooks/hooks.json` (wiring `sessionStart`, `sessionEnd`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `subagentStart`, `subagentStop`, `beforeShellExecution`, `afterShellExecution`, `beforeReadFile`, `afterFileEdit`, `preCompact`, and `stop`) plus stdlib-only hook scripts under `hooks/`. |
| MCP server `cursor-state-bridge` (state + optional memory tools) | `repo-owned` (opt-in install via `--with-mcp`) | `checked-in-artifact` for source + validators; `runtime-smoke` only when `RUN_MCP_BRIDGE_SMOKE=1` is set | This repo ships `mcp/cursor-state-bridge/` as a stdio JSON-RPC 2.0 server with six workflow-state tools (`state_read`, `state_init`, `state_set_phase`, `state_record_failure`, `state_update_acceptance_criterion`, `state_history_append`) and five optional memory tools (`memory_notepad_read`, `memory_notepad_append_working`, `memory_project_memory_read`, `memory_project_memory_set_directive`, `memory_wiki_log_append`) in `memory_io.ts`, plus trace lane, defense-in-depth auth, history FIFO eviction, agent-callable contract enforcement, `scripts/validate-mcp-server-structure.ts`, `scripts/smoke-mcp-cursor-state-bridge.ts`, the byte-equal `mcp.json` template, and tests. The user-environment config file `.cursor/mcp.json` is gitignored and validator-rejected. |
| Memory layer (notepad, project memory, decisions, wiki) | `repo-owned` | `checked-in-artifact` | Templates under `docs/templates/`, policy in `docs/memory-layer.md`, plugin rules `rules/memory-and-notepad.mdc` and `rules/rules-authoring.mdc`, owner skills `remember`, `notepad`, `wiki`, `decisions`, `rules-authoring`, and validators under `scripts/validate-*-format.py` / `tests/memory/`. Hooks do not write memory files. |
| Project agents | `repo-owned` | `checked-in-artifact` | This repo ships `agents/*.md` with validated YAML frontmatter and concise prompts. |
| Repo-root Cursor plugin manifest + bundled payload references | `repo-owned` | `checked-in-artifact` | This repo promotes `.cursor-plugin/plugin.json` plus referenced rules, skills, agents, and hooks into a checked-in plugin surface. |
| Local plugin load walkthrough | `repo-owned` docs with user-environment verification | `checked-in-artifact` for the walkthrough, stronger only with runtime evidence | This repo documents how to load the local plugin from `~/.cursor/plugins/local` and reload Cursor without pretending the reload step is repo-owned runtime automation. |
| Pages landing surface and workflow (when checked in) | `repo-owned` only after app + workflow + exported-output proof land together | `checked-in-artifact` once local validators confirm the checked-in app, workflow, and required landing links | A future `apps/cursor-backbone-site/` surface must prove itself as a checked-in artifact before public copy can describe it as repo-owned. |
| CLI consumption of repo guidance | `host-product-only` consuming repo-owned files | `official-doc` | Cursor CLI is documented to read root `AGENTS.md` / `.cursor/rules`; this repo relies on that documented behavior without inventing extra packaging. |
| MCP support | `host-product-only` for host loading; `repo-owned` for the checked-in bridge source | `official-doc` for Cursor MCP support plus `checked-in-artifact` for `mcp/cursor-state-bridge/` | Cursor supports MCP as a host capability. This repo has chosen a narrow opt-in state bridge, but still does not claim a default checked-in `.cursor/mcp.json` user config. |
| Custom modes | `host-product-only` | `official-doc` | Cursor documents custom modes as product settings/configuration; this repo does not claim a checked-in repo file format for them. |
| Background agents | `host-product-only` | `official-doc` | Cursor documents background agents as a product feature; this repo does not claim repo-file provisioning for them. |
| Additional workflow surfaces beyond checked-in hooks and agents | `unsupported-or-out-of-scope` unless separately adopted | Matching proof required | New surfaces only become repo-owned when artifacts, validators, and docs land together. |

## 1. Repo-owned instruction surfaces

Official Cursor rules documentation describes `AGENTS.md` as a simple markdown
instruction surface, while project rules are stored in `.cursor/rules`.
Official CLI documentation also says the CLI reads root `AGENTS.md` /
`.cursor/rules` guidance.

**How this repo uses that evidence:**

- keep one root `AGENTS.md`;
- keep scoped rule behavior in `.cursor/rules/*.mdc`; and
- treat those checked-in files as the canonical repo-owned instruction surface.

## 2. Project hooks are checked-in artifacts here

Official Cursor hook documentation describes project hooks at
`hooks/hooks.json` and trusted-workspace execution.

**How this repo uses that evidence:**

- keep `hooks/hooks.json` at the documented project path;
- keep hook scripts under `hooks/`;
- validate hook command paths and Python compilation; and
- describe runtime behavior only as far as Cursor execution and local/manual
  verification support.

## 3. Project agents are checked-in artifacts here

Official Cursor agent documentation describes project agents under
`agents/*.md` with YAML frontmatter.

**How this repo uses that evidence:**

- keep all fourteen agents (`orchestrator`, `architect`, `researcher`, `planner`,
  `implementer`, `qa-tester`, `verifier`, `critic`, `code-reviewer`,
  `debugger`, `tracer`, `security-reviewer`, `explore`, `test-engineer`) under
  `agents/`;
- validate `name`, `description`, `model`, and `readonly` frontmatter; and
- keep prompts concise and repository-specific.

## 4. The repo-root plugin is a checked-in artifact here

The approved plugin promotion is intentionally bounded: a repo-root manifest,
plugin-owned rules and skills, plus explicit references to checked-in agents and
hooks.

**How this repo uses that evidence:**

- keep `.cursor-plugin/plugin.json` at the repository root;
- keep the shipped plugin payload reviewable; and
- avoid upgrading commands, MCP, custom modes, or background-agent provisioning
  into repo-owned claims unless they land with matching artifacts and proof.

## 5. Cursor CLI consumes repo guidance

Official Cursor CLI documentation says the CLI agent supports the same rules
system as the editor, reads root `AGENTS.md` and `.cursor/rules`, and supports
MCP and resume behavior.

**How this repo uses that evidence:**

- treat this repo as a valid CLI workspace foundation;
- keep repo guidance at the root so CLI sessions can pick it up; and
- avoid claiming more than documented CLI behavior.

## 6. A repo-owned landing site only counts after checked-in proof exists

If this repo adds `apps/cursor-backbone-site/`, the site and its GitHub Pages
workflow only become **repo-owned** after all of the following are true:

- the app files are checked in;
- the deploy workflow is checked in;
- local validators can inspect the exported HTML; and
- the landing surface visibly links to `Docs`, `State Contract`, `References`,
  and `Benchmark Notes` without blurring ownership classes.

Until that proof exists, public wording should describe the landing surface as a
planned or in-progress checked-in artifact, not as a shipped repo-owned
capability.

## 7. MCP is documented, but remains host-product-only here

Official Cursor documentation covers MCP for Cursor and the CLI. That proves
MCP is a real Cursor capability, but it does **not** automatically make MCP a
repo-owned surface in this repository.

**How this repo uses that evidence:**

- acknowledge MCP as a real Cursor-native extension surface; but
- do not check in a default `.cursor/mcp.json` until a specific server,
  authentication model, and ownership decision are chosen.

## 8. Custom modes are a product capability, not a repo-file claim here

Official Cursor documentation describes Agent, Ask, Manual, and Custom modes,
with custom modes configured through the product.

**How this repo uses that evidence:**

- document modes as real Cursor product behavior; but
- do not claim a checked-in repository file format for custom-mode packaging
  unless that format is explicitly documented and adopted by plan.

## 9. Background agents are product capability, not repo provisioning

Official Cursor documentation describes background agents as a product feature.

**How this repo uses that evidence:**

- recognize background agents as part of the Cursor ecosystem; but
- avoid inventing a local repo provisioning story for them.

## 10. Richer adjacent surfaces stay deferred until separately proven

Cursor's current product direction includes richer orchestration features. This
repository only promotes a surface when matching artifacts and validators exist.

**How this repo uses that evidence:**

- keep product-awareness references in `docs/references.md` when useful; but
- preserve explicit bounded wording for deferred surfaces until the repo ships
  and validates a corresponding artifact.

## Practical backbone decision

Given the ownership and proof boundaries above, the safest starting point for an
`oh-my-cursor` repository is:

1. root `AGENTS.md`;
2. `.cursor/rules/*.mdc`;
3. `hooks/hooks.json` and `hooks/`;
4. `agents/*.md`;
5. a small repo-root plugin with reviewable payload references;
6. documentation that records `repo-owned`, `host-product-only`, and
   `unsupported-or-out-of-scope` clearly;
7. any repo-owned landing site only after checked-in artifact proof is present;
   and
8. opt-in MCP only after a specific integration is selected.
