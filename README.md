# oh-my-cursor

`oh-my-cursor` is an independent, self-developed Cursor-native workflow
backbone. It ships checked-in project guidance, plugin scaffolding, hooks,
agents, validators, and bounded docs while keeping ownership and proof classes
explicit.

This repository follows a shared **claim/proof discipline**:

- **repo-owned** — checked-in surfaces this repo actually ships;
- **host-product-only** — Cursor capabilities the product supports, but this
  repo does not provision as checked-in artifacts; and
- **unsupported-or-out-of-scope** — surfaces this repo intentionally does not
  ship or claim today.

Public wording also stays inside an explicit proof ceiling:

- **official-doc** when a claim is supported by current primary Cursor docs;
- **checked-in-artifact** when this repo ships the surface and local validators
  prove it is present; and
- **runtime-smoke** only when optional authenticated/model-available smoke runs
  succeed.

The current repo-owned backbone includes:

- root `AGENTS.md` guidance;
- project rules in `.cursor/rules/`;
- project hooks at `.cursor/hooks.json` plus `.cursor/hooks/` lifecycle scripts
  (`claim-guard.py`, `stop-gate.py`);
- project agents in `.cursor/agents/` (`researcher`, `planner`, `verifier`,
  `critic`, `debugger`, `security-reviewer`);
- a shared workflow-state contract under `.cursor/state/`;
- the `phase-controller` skill that routes work across the lifecycle;
- the repo-root Cursor plugin manifest at `.cursor-plugin/plugin.json`;
- plugin-owned rules and skills;
- bounded documentation that separates confirmed support from inference; and
- local verification scripts and benchmark artifacts tied to the canonical repo
  root.

## Plugin orchestration

Treat `oh-my-cursor` as orchestration-first. The plugin's hooks, skills,
agents, and shared workflow-state document coordinate one explicit lifecycle:

```text
intake → research → plan → execute → verify → review → done
                                              ↘ blocked
```

Start with [`docs/orchestration.md`](./docs/orchestration.md) for the full
lifecycle map. The shared state contract lives under
[`.cursor/state/`](./.cursor/state/README.md) and the orchestration entry
skill is
[`skills/phase-controller/SKILL.md`](./skills/phase-controller/SKILL.md).

## Start here

| Need | Read |
| --- | --- |
| Plugin orchestration overview | [`docs/orchestration.md`](./docs/orchestration.md) |
| Phase-controller skill | [`skills/phase-controller/SKILL.md`](./skills/phase-controller/SKILL.md) |
| Workflow-state contract | [`.cursor/state/README.md`](./.cursor/state/README.md) |
| Repository policy | [`AGENTS.md`](./AGENTS.md) |
| Product requirements | [`docs/PRD.yaml`](./docs/PRD.yaml) |
| Confirmed ownership and proof boundaries | [`docs/confirmed-surfaces.md`](./docs/confirmed-surfaces.md) |
| Local plugin load + reload walkthrough | [`docs/local-plugin-verification.md`](./docs/local-plugin-verification.md) |
| Product refinement priorities | [`docs/refinement-priority-map.md`](./docs/refinement-priority-map.md) |
| Plugin and workflow boundary review | [`docs/plugin-boundary-review.md`](./docs/plugin-boundary-review.md) |
| Fallback and non-claim rules | [`docs/fallback-policy.md`](./docs/fallback-policy.md) |
| Evidence links and access dates | [`docs/references.md`](./docs/references.md) |
| State ownership contract | [`docs/state-contract.md`](./docs/state-contract.md) |
| Public language validator | [`scripts/validate-public-language.py`](./scripts/validate-public-language.py) |
| Hook and agent artifact validator | [`scripts/validate-cursor-workflow-artifacts.py`](./scripts/validate-cursor-workflow-artifacts.py) |
| Workflow artifact smoke | [`scripts/smoke-cursor-workflow-artifacts.sh`](./scripts/smoke-cursor-workflow-artifacts.sh) |
| Workflow-state validator | [`scripts/validate-workflow-state.py`](./scripts/validate-workflow-state.py) |
| Surface visibility check | [`scripts/validate-surface-visibility.sh`](./scripts/validate-surface-visibility.sh) |
| Benchmark evidence check | [`scripts/validate-benchmark-evidence.sh`](./scripts/validate-benchmark-evidence.sh) |
| Landing-surface contract | [`scripts/validate-pages-surface.sh`](./scripts/validate-pages-surface.sh) |
| Local backbone verification | [`scripts/verify-backbone.sh`](./scripts/verify-backbone.sh) |
| Benchmark notes | [`benchmark/README.md`](./benchmark/README.md) |
| Change history | [`CHANGELOG.md`](./CHANGELOG.md) |

## Ownership map

| Outcome family | Ownership class | Strongest default proof here | What that means in this repo |
| --- | --- | --- | --- |
| Root instructions and rules | `repo-owned` | `checked-in-artifact` | This repo ships `AGENTS.md` and `.cursor/rules/`. |
| Project hooks | `repo-owned` in trusted Cursor workspaces | `checked-in-artifact`, plus runtime behavior only when Cursor runs the hooks | This repo ships `.cursor/hooks.json` and stdlib-only hook scripts for claim/proof and completion reminders. |
| Project agents | `repo-owned` | `checked-in-artifact` | This repo ships `.cursor/agents/*.md` with validated frontmatter and concise prompts. |
| Repo-root Cursor plugin manifest + bundled payload | `repo-owned` | `checked-in-artifact` | This repo treats `.cursor-plugin/plugin.json` plus referenced rules, skills, agents, and hooks as a checked-in plugin surface. |
| Local plugin install walkthrough | `repo-owned` docs + manual user-environment verification | `checked-in-artifact` for the walkthrough, `runtime-smoke` only if a future authenticated smoke exists | The repo documents local plugin loading via `~/.cursor/plugins/local` and Cursor reload, while the loaded session remains user-environment proof. |
| Verification and benchmark reporting | `repo-owned` | `checked-in-artifact` | This repo ships local validators, smoke wrappers, and checked-in benchmark artifacts. |
| Landing Pages site and deploy workflow | `repo-owned` only when checked in | `checked-in-artifact` once app files, workflow, and exported-output validation all exist | The `apps/cursor-backbone-site/` surface counts as repo-owned only with app, workflow, and visible-proof checks together. |
| MCP support | `host-product-only` | `official-doc` | Cursor supports MCP, but this repo leaves it opt-in until a concrete server, auth model, and ownership decision are chosen. |
| Custom modes and background agents | `host-product-only` | `official-doc` | Cursor exposes these capabilities as product surfaces; this repo does not package them as checked-in workflow files. |

## What this repo includes

- a root `AGENTS.md` for always-on project guidance;
- scoped Cursor project rules in `.cursor/rules/*.mdc`;
- project hook configuration in `.cursor/hooks.json` and hook helpers under
  `.cursor/hooks/`;
- project agents in `.cursor/agents/*.md`;
- a repo-root plugin manifest under `.cursor-plugin/plugin.json`;
- plugin-owned rules and skills;
- documentation that labels confirmed behavior, inference, and explicit
  non-claims;
- a landing-surface validator that keeps any repo-owned Pages site docs-first,
  evidence-linked, and boundary-truthful; and
- benchmark evidence under `benchmark/results/` that stays tied to the
  canonical repo root.

If capability claims change in `AGENTS.md`, `README.md`, `docs/**`, or
`.cursor/rules/**`, update [`docs/references.md`](./docs/references.md) in the
same change.

## What this repo does not claim

This backbone intentionally does **not** claim any of the following unless they
are later promoted with current official documentation, an approved plan, and
appropriate proof artifacts:

- custom mode configuration;
- background-agent provisioning;
- a default `.cursor/mcp.json`; or
- marketplace publication as a completion gate for local plugin use.

## Local plugin loading

The repo-owned plugin files are intended to be tested locally through Cursor's
local plugin path:

1. run `./scripts/install-local-plugin.sh`;
2. confirm the local plugin path now exists at `~/.cursor/plugins/local/oh-my-cursor`;
3. confirm `.cursor-plugin/plugin.json` exists at the plugin root;
4. restart Cursor or run **Developer: Reload Window**; and
5. verify the shipped plugin components load as expected.

The detailed manual checklist lives in
[`docs/local-plugin-verification.md`](./docs/local-plugin-verification.md).
For a bounded non-UI verification of the helper itself, run
[`scripts/check-local-plugin-install.sh`](./scripts/check-local-plugin-install.sh).

## Design rule

Prefer the smallest confirmed Cursor-native surface first:

1. root `AGENTS.md`;
2. `.cursor/rules/` project rules;
3. `.cursor/hooks.json` and `.cursor/hooks/` helpers;
4. `.cursor/agents/` project agents;
5. the repo-root plugin manifest with explicit references to shipped payloads;
6. bounded docs and validators that explain what is repo-owned vs
   host-product-only; and
7. opt-in MCP only after choosing a real server and ownership model.

That keeps the repo useful today while preventing deferred surfaces from turning
into hidden maintenance debt.

## Landing-surface contract

The checked-in `apps/cursor-backbone-site/` surface must remain a **repo-owned**
artifact rather than a vague marketing layer. In practice that means:

- the title, primary heading, and metadata lead with `oh-my-cursor`;
- the landing surface keeps `Docs`, `State Contract`, `References`, and
  `Benchmark Notes` visibly reachable;
- rendered copy must not rewrite `host-product-only` or
  `unsupported-or-out-of-scope` surfaces as repo-owned capability claims; and
- proof links should point back to checked-in docs and validators.

The validator at
[`scripts/validate-pages-surface.sh`](./scripts/validate-pages-surface.sh)
keeps that contract explicit.

## Verification

Run from the repository root.

Always-required checks:

```bash
python3 scripts/validate-public-language.py
python3 scripts/validate-cursor-workflow-artifacts.py
./scripts/smoke-cursor-workflow-artifacts.sh
./scripts/verify-backbone.sh
./scripts/validate-surface-visibility.sh
./scripts/validate-pages-surface.sh
./scripts/validate-state-contract.sh
./scripts/check-local-plugin-install.sh
```

Optional environment-gated smoke that can strengthen bounded wording to
`runtime-smoke` when available:

```bash
RUN_CURSOR_AGENT_SMOKE=1 ./scripts/smoke-cursor-agent.sh --run-agent-prompt
```

For the architecture-specific backbone benchmark:

```bash
./benchmark/quick_test.sh --variant baseline
RUN_CURSOR_AGENT_SMOKE=1 ./benchmark/quick_test.sh --variant enhanced --run-agent-smoke
```

Those runs refresh `benchmark/results/current-baseline/` and
`benchmark/results/current-enhanced/` respectively, while appending a summary
row to `benchmark/results/history.md`.
