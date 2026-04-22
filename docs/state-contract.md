# Cursor State Contract

This repository keeps its state contract intentionally small, explicit, and
aligned with the claim/proof discipline.

## Ownership model

| State family | Ownership class | Current rule |
| --- | --- | --- |
| User auth and default model selection | `host-product-only` user environment | Cursor CLI auth/model state lives outside the repo. |
| Repo guidance, root rules, repo-root plugin files, validators, and benchmark evidence | `repo-owned` | This repo checks in the files that define its backbone and proof surface. |
| Default MCP config, repo memories, repo-file custom modes, repo-file background-agent files | `unsupported-or-out-of-scope` until deliberately adopted | These are not checked in by the current backbone. |

## User-level state

The authenticated Cursor CLI state belongs to the user environment, not the
repository:

- `~/.cursor/cli-config.json`
- `~/.cursor/plugins/local/` for local plugin loading during manual validation
- other Cursor caches and agent state under `~/.cursor/`

That is why this repo validates **default auth availability** rather than
pretending the repo provisions auth by itself.

## Repo-level state

The repository currently owns only these checked-in state-like surfaces:

- `AGENTS.md`
- `.cursor/rules/*.mdc`
- `.cursor-plugin/plugin.json`
- the shipped plugin rule/skill payload that accompanies the manifest
- bounded documentation
- local verification/benchmark scripts
- `apps/cursor-backbone-site/` and `.github/workflows/deploy-pages.yml` only
  when they are actually checked in and locally validated
- benchmark artifacts under `benchmark/results/current-baseline/` and
  `benchmark/results/current-enhanced/`, with the benchmark wrapper normalizing
  transient `/.omx/team/.../worktrees/...` invocation paths back to the
  canonical repo root before writing checked-in evidence

Those are the only surfaces this repo should describe as `repo-owned`
state/proof artifacts today.

If the Pages app/workflow is absent, it remains a planned or missing checked-in
artifact rather than a current state guarantee.

## Host-product-only state

Some Cursor capabilities depend on product-managed state that this repo does not
own, including:

- authenticated CLI account state;
- default model selection;
- runtime session history and caches; and
- any product-managed configuration behind modes or background-agent behavior.

These may be real Cursor capabilities, but they are not repo-owned guarantees.

## Explicit non-state surfaces

Until they are directly proven, chosen, and intentionally adopted, this repo
does **not** check in:

- `.cursor/mcp.json`
- `.cursor/memories/`
- repo-file custom mode packaging
- repo-file background-agent provisioning
- checked-in custom-agent surfaces
- checked-in hook manifests

## Why this matters

The safest Cursor-native backbone is one that separates:

1. **user auth + model availability**
2. **repo guidance, root rules, repo-root plugin files, and checked-in proof artifacts**
3. **future optional integrations**

That prevents hidden product-state assumptions from turning into fake
repository guarantees.

The same rule applies to any future landing site: a repo-owned Pages surface is
real only when the checked-in app, workflow, and exported-output validation all
exist together.

## Local validation

Run:

```bash
./scripts/install-local-plugin.sh
./scripts/check-default-auth.sh
./scripts/validate-state-contract.sh
```
