# oh-my-cursor

`oh-my-cursor` is a small, truthful Cursor-native repository that now promotes
its repo root into a ready-to-use Cursor plugin while keeping ownership and
proof boundaries explicit.

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

The current backbone deliberately starts from the strongest truthful
repo-owned surfaces checked in today:

- root `AGENTS.md` guidance;
- project rules in `.cursor/rules/`;
- the repo-root Cursor plugin manifest at `.cursor-plugin/plugin.json`;
- plugin-owned rules plus at least one plugin-owned skill;
- bounded documentation that separates confirmed support from inference; and
- local verification scripts and benchmark artifacts tied to the canonical repo
  root.

## Start here

| Need | Read |
| --- | --- |
| Repository policy | [`AGENTS.md`](./AGENTS.md) |
| Confirmed ownership and proof boundaries | [`docs/confirmed-surfaces.md`](./docs/confirmed-surfaces.md) |
| Local plugin load + reload walkthrough | [`docs/local-plugin-verification.md`](./docs/local-plugin-verification.md) |
| Learning-driven refinement priorities | [`docs/refinement-priority-map.md`](./docs/refinement-priority-map.md) |
| Plugin boundary + support-tooling review | [`docs/plugin-boundary-review.md`](./docs/plugin-boundary-review.md) |
| Hard fallback and non-claim rules | [`docs/fallback-policy.md`](./docs/fallback-policy.md) |
| Source links and access dates | [`docs/references.md`](./docs/references.md) |
| State ownership contract | [`docs/state-contract.md`](./docs/state-contract.md) |
| Local state contract | [`scripts/validate-state-contract.sh`](./scripts/validate-state-contract.sh) |
| Surface visibility check | [`scripts/validate-surface-visibility.sh`](./scripts/validate-surface-visibility.sh) |
| Benchmark evidence check | [`scripts/validate-benchmark-evidence.sh`](./scripts/validate-benchmark-evidence.sh) |
| Landing-surface contract | [`scripts/validate-pages-surface.sh`](./scripts/validate-pages-surface.sh) |
| Default auth check | [`scripts/check-default-auth.sh`](./scripts/check-default-auth.sh) |
| Optional `auto`-model smoke | [`scripts/smoke-cursor-agent.sh`](./scripts/smoke-cursor-agent.sh) |
| Local backbone verification | [`scripts/verify-backbone.sh`](./scripts/verify-backbone.sh) |
| Benchmark notes | [`benchmark/README.md`](./benchmark/README.md) |

## Ownership map

| Outcome family | Ownership class | Strongest default proof here | What that means in this repo |
| --- | --- | --- | --- |
| Root instructions and rules | `repo-owned` | `checked-in-artifact` | This repo ships `AGENTS.md` and `.cursor/rules/`. |
| Repo-root Cursor plugin manifest + bundled plugin rules/skills | `repo-owned` | `checked-in-artifact` | This repo treats `.cursor-plugin/plugin.json` plus its shipped rule/skill payload as a checked-in plugin surface. |
| Local plugin install walkthrough | `repo-owned` docs + manual user-environment verification | `checked-in-artifact` for the walkthrough, `runtime-smoke` only if a future authenticated smoke exists | The repo documents local plugin loading via `~/.cursor/plugins/local` and Cursor reload, but the actual loaded session remains user-environment proof. |
| Verification and benchmark reporting | `repo-owned` | `checked-in-artifact` | This repo ships local validators, smoke wrappers, and checked-in benchmark artifacts. |
| Landing Pages site and deploy workflow | `repo-owned` only when checked in | `checked-in-artifact` once app files, workflow, and exported-output validation all exist | A future `apps/cursor-backbone-site/` surface counts as repo-owned only after the site, workflow, and visible-proof checks all land together. |
| MCP support | `host-product-only` | `official-doc` | Cursor supports MCP, but this repo leaves it opt-in until a concrete server, auth model, and ownership decision are chosen. |
| Modes and background agents | `host-product-only` | `official-doc` | Cursor exposes these capabilities as product surfaces; this repo does not package them as checked-in workflow files. |
| Hooks, custom agents, repo-file custom modes, repo-file background-agent provisioning | `unsupported-or-out-of-scope` | `official-doc` for product awareness, negative repo claim here | This repo intentionally keeps these richer surfaces deferred until matching artifacts and proof land. |

## What this repo includes

- a root `AGENTS.md` for always-on project guidance;
- scoped Cursor project rules in `.cursor/rules/*.mdc`;
- a repo-root plugin manifest under `.cursor-plugin/plugin.json`;
- a minimal shipped plugin payload with plugin-owned rules and at least one
  plugin-owned skill;
- documentation that labels confirmed behavior, inference, and explicit
  non-claims;
- a landing-surface validator that keeps any future repo-owned Pages site
  docs-first, evidence-linked, and boundary-truthful; and
- benchmark evidence under `benchmark/results/` that stays tied to the
  canonical repo root.

## What this repo does **not** claim

This backbone intentionally does **not** claim any of the following unless they
are later promoted with current official documentation, an approved plan, and
appropriate proof artifacts:

- checked-in hook manifests or custom-agent packaging;
- repo-file custom mode configuration;
- repo-file background-agent provisioning;
- a default repo-owned `.cursor/mcp.json`; or
- marketplace publication as a completion gate for local plugin use.

## Local plugin loading

The repo-owned plugin files are intended to be tested locally through Cursor's
local plugin path:

1. symlink or copy this repository into `~/.cursor/plugins/local/oh-my-cursor`;
2. confirm `.cursor-plugin/plugin.json` exists at the plugin root;
3. restart Cursor or run **Developer: Reload Window**; and
4. verify the shipped plugin components load as expected.

The detailed manual checklist lives in
[`docs/local-plugin-verification.md`](./docs/local-plugin-verification.md).

## Design rule

Prefer the smallest confirmed Cursor-native surface first:

1. root `AGENTS.md`;
2. `.cursor/rules/` project rules;
3. the repo-root plugin manifest with a minimal shipped rule/skill payload;
4. bounded docs and validators that explain what is repo-owned vs
   host-product-only; and
5. opt-in MCP only after choosing a real server and ownership model.

That keeps the repo useful today while preventing richer deferred surfaces from
turning into hidden maintenance debt.

The flagship landing rhythm is intentionally still repo-local. The visual system
now aligns with the sibling `oh-my-copilot` surface, but we are **not**
extracting a shared cross-repo design-system package yet. That stays deferred
until repeated patterns justify the maintenance cost and can be proven without
weakening this repo's ownership/proof boundaries.

## Landing-surface contract

If this repo later checks in `apps/cursor-backbone-site/` as a GitHub Pages
surface, that landing page must remain a **repo-owned** checked-in artifact
rather than a vague marketing layer. In practice that means:

- the title, primary heading, and metadata lead with `oh-my-cursor`;
- the landing surface keeps `Docs`, `State Contract`, `References`, and
  `Benchmark Notes` visibly reachable;
- any visible sibling link to `oh-my-copilot` stays comparison/context scoped,
  not canonical or ownership-scoped; and
- rendered copy must not rewrite `host-product-only` or
  `unsupported-or-out-of-scope` surfaces as repo-owned capability claims.

The validator at
[`scripts/validate-pages-surface.sh`](./scripts/validate-pages-surface.sh)
exists to keep that contract explicit once the Pages app is checked in.

## Verification

Run from the repository root.

Always-required checks:

```bash
./scripts/verify-backbone.sh
./scripts/validate-surface-visibility.sh
./scripts/validate-pages-surface.sh
./scripts/validate-state-contract.sh
./scripts/check-default-auth.sh
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
row to `benchmark/results/history.md`. The benchmark wrapper also normalizes
transient `/.omx/team/.../worktrees/...` invocation paths back to the canonical
repo root before it records checked-in evidence.
