# oh-my-cursor Benchmark Notes

This benchmark surface is intentionally **not the same** as
`oh-my-copilot`'s benchmark harness.

`oh-my-copilot` scores root/plugin/hook discoverability and installed-plugin
state. `oh-my-cursor` currently scores a different, smaller contract:

- default Cursor auth availability;
- `auto` model availability;
- visible repo-native surfaces (`AGENTS.md`, `.cursor/rules`, docs);
- repo state-contract discipline; and
- optional `cursor-agent` smoke using `--model auto`.

The shared report shape is only **reporting-comparable** with
`oh-my-copilot`. It is **not** an architectural-parity claim: this benchmark
measures truthful Cursor-native proof for a smaller backbone contract.

## Run

```bash
# baseline, no model-backed agent request
./benchmark/quick_test.sh --variant baseline

# enhanced, includes constrained agent smoke with --model auto
RUN_CURSOR_AGENT_SMOKE=1 ./benchmark/quick_test.sh --variant enhanced --run-agent-smoke
```

Always-required checked-in proof still lives in:

- `./scripts/verify-backbone.sh`
- `./scripts/validate-surface-visibility.sh`
- `./scripts/validate-pages-surface.sh`
- `./scripts/validate-state-contract.sh`

The benchmark runs above are **environment-gated runtime proof**. They only
strengthen public wording when local Cursor auth/model access is available and
successful.

## Why the score differs from oh-my-copilot

This repo does not currently ship hooks, prompt files, skill bundles, or
namespaced plugin packaging. Scoring it like `oh-my-copilot` would be fake
parity.

If this repo later ships a checked-in Pages landing surface, that site still has
to expose `Benchmark Notes` as a visible proof entry point. The landing page may
improve presentation, but it does not get to hide the benchmark contract.

The benchmark here therefore treats the current Cursor-native backbone as:

1. authenticated CLI availability;
2. visible checked-in repository guidance;
3. explicit fallback/state discipline; and
4. optional model-backed proof with `auto`.

It also reuses the `default_auth` result when the harness reaches
`smoke_cursor`, so the benchmark does not spend extra time rerunning the same
local auth/model verification inside the smoke step.

Baseline therefore proves the auth + `auto` backbone when the environment can
support it. Enhanced adds `CURSOR_AGENT_OK` as extra runtime proof instead of
silently upgrading the repo's checked-in claims.

## History

By default, baseline and enhanced runs write their latest artifacts to separate
variant-specific directories:

- `benchmark/results/current-baseline/`
- `benchmark/results/current-enhanced/`

Each run appends to `benchmark/results/history.jsonl` and regenerates
`benchmark/results/history.md` so baseline/enhanced scores can be tracked over
time by branch and git SHA. The benchmark wrapper also normalizes transient
`/.omx/team/.../worktrees/...` invocation paths back to the canonical repo root
before it records checked-in proof evidence.
