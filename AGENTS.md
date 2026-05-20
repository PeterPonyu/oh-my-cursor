# oh-my-cursor repository instructions

This repository is a Cursor-native workflow backbone — a local plugin that
ships rules, skills, agents, and hooks to Cursor workspaces. Keep it
docs-first, evidence-backed, and explicit about which surfaces are
checked-in artifacts versus Cursor product capabilities.

## Core rules

- Keep the repo docs-first and evidence-backed.
- Prefer root `AGENTS.md`, `.cursor/rules/`, `hooks/hooks.json`, and
  `agents/` before speculative runtime or packaging layers.
- When changing capability claims in `AGENTS.md`, `README.md`, `docs/**`,
  or `.cursor/rules/**`, update `docs/references.md` in the same change
  with official links and the access date.
- Label inference as inference.

## Editing posture

- Prefer small, reviewable documentation and rule changes.
- Keep wording Cursor-native and product-specific.
- If a surface is ambiguous, fall back to plain repository guidance and
  scoped rules rather than speculative automation.

## Agent model policy

- All checked-in agents under `agents/` use `model: auto` so the
  Cursor host selects the best available model for the role.
- Do not change an agent to a fixed model without a reproducible
  benchmark proving that model is required.

## Promotion boundaries

- Do **not** claim checked-in Cursor plugin/package loading unless
  directly proven with current official Cursor documentation.
- Do **not** assume custom modes have a checked-in project file format
  unless that format is officially documented.
- Do **not** assume background agents are provisioned from repo files
  unless documented.
- Hooks, agents, and workflow-state helpers are repo-owned only to the
  extent represented by `hooks/hooks.json`, `hooks/`,
  `agents/` (fourteen roles: `orchestrator`, `architect`, `researcher`,
  `planner`, `implementer`, `qa-tester`, `verifier`, `critic`,
  `code-reviewer`, `debugger`, `tracer`, `security-reviewer`, `explore`,
  `test-engineer`), `.cursor/state/`, and their validators.
- The MCP server at `mcp/cursor-state-bridge/` is `repo-owned` opt-in:
  the default plugin install excludes it; users add it via
  `./scripts/install-local-plugin.sh --with-mcp` using the template at
  `mcp.json`.

## Claim/proof discipline

When changing capability claims, be explicit about ownership and proof:

- **ownership class**: `repo-owned`, `host-product-only`, or
  `unsupported-or-out-of-scope`
- **proof class**: `official-doc`, `checked-in-artifact`, or `runtime-smoke`
- **public wording rule**: never rewrite `host-product-only` as
  `repo-owned`; never soften an `unsupported-or-out-of-scope` negative
  into vague implied support; never claim stronger proof than current
  artifacts support.

See `docs/confirmed-surfaces.md` for the current ownership map.
See `docs/references.md` for official citation links.
