# oh-my-cursor repository instructions

This repository is an independent, self-developed Cursor-native workflow
backbone. Keep it docs-first, evidence-backed, and explicit about which
surfaces are checked in here versus managed by Cursor itself.

## Core rules

- Keep the repo docs-first and evidence-backed.
- Prefer root `AGENTS.md` plus `.cursor/rules/` before inventing new packaging
  layers.
- When changing capability claims in `AGENTS.md`, `README.md`, `docs/**`, or
  `.cursor/rules/**`, update `docs/references.md` in the same change with
  official links and the access date.
- Label inference as inference.

## Claim/proof discipline

When you strengthen or restate a capability claim, keep all three dimensions
explicit:

- **ownership class**
  - `repo-owned`: this repo ships the surface as a checked-in artifact;
  - `host-product-only`: Cursor supports the capability, but this repo does not
    provision it as a checked-in repo surface; and
  - `unsupported-or-out-of-scope`: this repo intentionally does not ship or
    claim the surface.
- **proof class**
  - `official-doc`: supported by current primary Cursor docs;
  - `checked-in-artifact`: supported by checked-in files plus local validation;
  - `runtime-smoke`: allowed only when optional authenticated/model-available
    smoke evidence succeeds.
- **public wording rule**
  - never rewrite `host-product-only` as `repo-owned`;
  - never soften an `unsupported-or-out-of-scope` negative into vague implied
    support; and
  - never claim stronger proof than the current artifact or runtime evidence
    supports.

Current `repo-owned` surfaces here are the root `AGENTS.md`, `.cursor/rules/`,
`.cursor/hooks.json` plus `.cursor/hooks/`, `.cursor/agents/`, the repo-root
plugin manifest with explicit `rules`/`skills`/`agents`/`hooks` references,
bounded docs, local validators, and checked-in benchmark artifacts. MCP,
custom modes, and background agents remain outside this repo until a concrete
artifact, ownership model, and validator land together.

## Promotion boundaries

- Do **not** claim checked-in Cursor plugin/package loading unless directly
  proven with current official Cursor documentation and a reproducible proof
  note.
- Do **not** assume custom modes have a checked-in project file format unless
  that format is officially documented.
- Do **not** assume background agents are provisioned from repo files unless
  that workflow is officially documented.
- Do **not** add MCP config until a concrete server and ownership model are
  chosen.
- Hooks and agents are now repo-owned only to the extent represented by
  `.cursor/hooks.json`, `.cursor/hooks/`, `.cursor/agents/`, and the validators
  that inspect them.

## Editing posture

- Prefer small, reviewable documentation and rule changes.
- Keep wording Cursor-native and product-specific.
- If a surface is ambiguous, fall back to plain repository guidance and scoped
  rules rather than speculative automation.
