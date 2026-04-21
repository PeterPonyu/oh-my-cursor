# Cursor State Contract

This repository keeps its state contract intentionally small and explicit.

## User-level state

The authenticated Cursor CLI state belongs to the user environment, not the
repository:

- `~/.cursor/cli-config.json`
- other Cursor caches and agent state under `~/.cursor/`

That is why this repo validates **default auth availability** rather than
pretending the repo provisions auth by itself.

## Repo-level state

The repository currently owns only these checked-in state-like surfaces:

- `AGENTS.md`
- `.cursor/rules/*.mdc`
- bounded documentation
- local verification/benchmark scripts

## Explicit non-state surfaces

Until they are directly proven and chosen, this repo does **not** check in:

- `.cursor/mcp.json`
- `.cursor/memories/`
- repo-file custom mode packaging
- repo-file background-agent provisioning
- plugin/package loading claims

## Why this matters

The safest Cursor-native backbone is one that separates:

1. **user auth + model availability**
2. **repo guidance and rules**
3. **future optional integrations**

That prevents hidden product-state assumptions from turning into fake
repository guarantees.

## Local validation

Run:

```bash
./scripts/check-default-auth.sh
./scripts/validate-state-contract.sh
```
