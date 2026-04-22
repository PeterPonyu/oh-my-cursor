# Confirmed Cursor-native surfaces

As of **April 21, 2026**, this repository backbone distinguishes three classes
of truth:

- **repo-owned** — checked-in surfaces this repo ships and validates;
- **host-product-only** — Cursor product capabilities documented by Cursor, but
  not provisioned by this repo as checked-in files; and
- **unsupported-or-out-of-scope** — product-adjacent surfaces this repo does not
  currently ship or claim.

## Ownership and proof map

| Outcome family | Ownership class | Strongest proof class used here | Current repo position |
| --- | --- | --- | --- |
| Root instructions and policy | `repo-owned` | `checked-in-artifact` | This repo ships one root `AGENTS.md` and `.cursor/rules/` guidance. |
| Pages landing surface and workflow (when checked in) | `repo-owned` only after app + workflow + exported-output proof land together | `checked-in-artifact` once local validators confirm the checked-in app, workflow, and required landing links | A future `apps/cursor-backbone-site/` surface must prove itself as a checked-in artifact before public copy can describe it as repo-owned. |
| CLI consumption of repo guidance | `host-product-only` consuming repo-owned files | `official-doc` | Cursor CLI is documented to read root `AGENTS.md` / `.cursor/rules`; this repo relies on that documented behavior without inventing extra packaging. |
| MCP support | `host-product-only` | `official-doc` | Cursor supports MCP, but this repo keeps MCP opt-in until a concrete server and ownership model are chosen. |
| Custom modes | `host-product-only` | `official-doc` | Cursor documents custom modes as product settings/configuration; this repo does not claim a checked-in repo file format for them. |
| Background agents | `host-product-only` | `official-doc` | Cursor documents background agents as a product feature; this repo does not claim repo-file provisioning for them. |
| Plugin / skill / hook / custom-agent packaging | `unsupported-or-out-of-scope` in this repo | `official-doc` for product awareness, negative repo claim here | Cursor may support richer packaging/product surfaces, but this repo ships none of them as checked-in backbone surfaces today. |

## 1. Repo-owned instruction surfaces

Official Cursor rules documentation describes `AGENTS.md` as a simple markdown
instruction surface, while project rules are stored in `.cursor/rules`.
Official CLI documentation also says the CLI reads root `AGENTS.md` /
`.cursor/rules` guidance.

**How this repo uses that evidence:**
- keep one root `AGENTS.md`;
- keep scoped rule behavior in `.cursor/rules/*.mdc`; and
- treat those checked-in files as the canonical repo-owned instruction surface.

## 2. Cursor CLI consumes repo guidance

Official Cursor CLI documentation says the CLI agent supports the same rules
system as the editor, reads root `AGENTS.md` and `.cursor/rules`, and supports
MCP and resume behavior.

**How this repo uses that evidence:**
- treat this repo as a valid CLI workspace foundation;
- keep repo guidance at the root so CLI sessions can pick it up; and
- avoid claiming more than documented CLI behavior.

## 3. A repo-owned landing site only counts after checked-in proof exists

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

## 4. MCP is documented, but remains host-product-only here

Official Cursor documentation covers MCP for Cursor and the CLI. That proves
MCP is a real Cursor capability, but it does **not** automatically make MCP a
repo-owned surface in this repository.

**How this repo uses that evidence:**
- acknowledge MCP as a real Cursor-native extension surface; but
- do not check in a default `.cursor/mcp.json` until a specific server,
  authentication model, and ownership decision are chosen.

## 5. Custom modes are a product capability, not a repo-file claim here

Official Cursor documentation describes Agent, Ask, Manual, and Custom modes,
with custom modes configured through the product.

**How this repo uses that evidence:**
- document modes as real Cursor product behavior; but
- do not claim a checked-in repository file format for custom-mode packaging
  unless that format is explicitly documented and adopted by plan.

## 6. Background agents are product capability, not repo provisioning

Official Cursor documentation describes background agents as a product feature.

**How this repo uses that evidence:**
- recognize background agents as part of the Cursor ecosystem; but
- avoid inventing a local repo provisioning story for them.

## 7. Richer packaging surfaces stay unsupported-or-out-of-scope here

Cursor's current product direction includes richer surfaces such as plugins and
subagent-oriented packaging, but this repository's backbone still ships **zero**
checked-in custom agent files, prompt files, skill bundles, or hook manifests.

**How this repo uses that evidence:**
- keep product-awareness references in `docs/references.md` when useful; but
- preserve explicit negative wording until the repo actually ships and validates
  a corresponding surface.

## Practical backbone decision

Given the ownership and proof boundaries above, the safest starting point for an
`oh-my-cursor` repository is:

1. root `AGENTS.md`;
2. `.cursor/rules/*.mdc`;
3. documentation that records `repo-owned`, `host-product-only`, and
   `unsupported-or-out-of-scope` clearly;
4. any repo-owned landing site only after checked-in artifact proof is present;
   and
5. opt-in MCP only after a specific integration is selected.
