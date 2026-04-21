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

## Run

```bash
# baseline, no model-backed agent request
./benchmark/quick_test.sh --variant baseline

# enhanced, includes constrained agent smoke with --model auto
RUN_CURSOR_AGENT_SMOKE=1 ./benchmark/quick_test.sh --variant enhanced --run-agent-smoke
```

## Why the score differs from oh-my-copilot

This repo does not currently ship hooks, prompt files, skill bundles, or
namespaced plugin packaging. Scoring it like `oh-my-copilot` would be fake
parity.

The benchmark here therefore treats the current Cursor-native backbone as:

1. authenticated CLI availability;
2. visible checked-in repository guidance;
3. explicit fallback/state discipline; and
4. optional model-backed proof with `auto`.


## History

Each run appends to `benchmark/results/history.jsonl` and regenerates
`benchmark/results/history.md` so baseline/enhanced scores can be tracked over
time by branch and git SHA.
