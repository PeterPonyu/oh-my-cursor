# oh-my-cursor

`oh-my-cursor` is a small, docs-first repository backbone for building a
Cursor-native workspace without overclaiming unsupported packaging or runtime
surfaces.

The current backbone deliberately starts from the official surfaces that are
clearly documented today:

- root `AGENTS.md` instructions;
- project rules in `.cursor/rules/`;
- optional MCP support when you have a concrete server to wire up;
- product capabilities such as custom modes and background agents, documented as
  capabilities rather than assumed file formats.

## Start here

| Need | Read |
| --- | --- |
| Repository policy | [`AGENTS.md`](./AGENTS.md) |
| Confirmed Cursor-native surfaces | [`docs/confirmed-surfaces.md`](./docs/confirmed-surfaces.md) |
| Hard fallback boundaries | [`docs/fallback-policy.md`](./docs/fallback-policy.md) |
| Source links and access dates | [`docs/references.md`](./docs/references.md) |
| State contract | [`docs/state-contract.md`](./docs/state-contract.md) |
| Local state contract | [`scripts/validate-state-contract.sh`](./scripts/validate-state-contract.sh) |
| Surface visibility check | [`scripts/validate-surface-visibility.sh`](./scripts/validate-surface-visibility.sh) |
| Default auth check | [`scripts/check-default-auth.sh`](./scripts/check-default-auth.sh) |
| Optional `auto`-model smoke | [`scripts/smoke-cursor-agent.sh`](./scripts/smoke-cursor-agent.sh) |
| Local backbone verification | [`scripts/verify-backbone.sh`](./scripts/verify-backbone.sh) |
| Benchmark notes | [`benchmark/README.md`](./benchmark/README.md) |

## What this repo includes

- a root `AGENTS.md` for always-on project guidance;
- scoped Cursor project rules in `.cursor/rules/*.mdc`;
- documentation that separates confirmed behavior from inference; and
- a lightweight verification script for the checked-in backbone.

## What this repo does not claim

This backbone intentionally does **not** claim any of the following unless they
are directly proven later with current official docs and a checked-in proof log:

- CLI-native plugin/package loading as a stable repository packaging surface;
- file-based custom mode configuration checked into the repo;
- file-based background-agent provisioning from inside the repo; or
- parity with `oh-my-codex`, `oh-my-claudecode`, or any tmux-style worker runtime.

## Design rule

Prefer the smallest confirmed Cursor-native surface first:

1. root `AGENTS.md`;
2. `.cursor/rules/` project rules;
3. opt-in MCP only after choosing a real server;
4. product features like custom modes or background agents only when their
   configuration surface is actually documented and verified.

That keeps the repo useful today while preventing unsupported packaging claims
from turning into hidden maintenance debt.

## Verification

Run from the repository root:

```bash
./scripts/verify-backbone.sh
./scripts/validate-surface-visibility.sh
./scripts/validate-state-contract.sh
./scripts/check-default-auth.sh
```

For the optional model-backed smoke, use the budget-aware `auto` model:

```bash
RUN_CURSOR_AGENT_SMOKE=1 ./scripts/smoke-cursor-agent.sh --run-agent-prompt
```

For the architecture-specific backbone benchmark:

```bash
./benchmark/quick_test.sh --variant baseline
RUN_CURSOR_AGENT_SMOKE=1 ./benchmark/quick_test.sh --variant enhanced --run-agent-smoke
```
