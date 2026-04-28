# benchmark/runs — recorder + audit trail

This package records every benchmark run as an append-only stream of
JSON events plus per-task artifacts. It has no third-party dependencies;
HTTP is via `urllib.request`.

## Layout

```
benchmark/runs/
  __init__.py
  recorder.py          # Recorder class, PRICING table
  replay.py            # render events.jsonl -> replay.txt (CLI + import)
  summary.py           # one-line CSV aggregate (CLI + import)
  budget_guard.py      # cost/task counters (CLI)
  anthropic_client.py  # urllib-only Messages API caller
  schema.md            # JSONL event schema
  README.md            # this file
  data/                # gitignored, one subdir per run
  pilot/               # 3-task A1-style pilot
```

Each run produces:

```
data/<UTC_TS>__<benchmark>__<arm>__<model_flat>__<run_id>/
  manifest.json
  events.jsonl
  summary.csv
  replay.txt
  per-task/<task_id>/
    prompt.md
    request.json
    response.md
    response_raw.json
    metadata.json
```

## Usage

```python
from benchmark.runs.recorder import Recorder
from benchmark.runs.anthropic_client import call_anthropic

rec = Recorder(
    benchmark="a1-pilot",
    arm="with-omc",
    model="anthropic/claude-haiku-4-5-20251001",
    budget_usd=2.0,
)

rec.task_start("t1", "Why is the sky blue?", metadata={"system": "Be brief."})
req = {"model": rec.model, "system": "Be brief.", "messages": [{"role": "user", "content": "Why is the sky blue?"}], "max_tokens": 256, "temperature": 0.2}
rec.request("t1", req)
out = call_anthropic(rec.model, "Be brief.", "Why is the sky blue?", max_tokens=256)
decision = rec.response("t1", out["raw"], out["tokens"], out["wallclock_ms"])
rec.task_end("t1", status="ok")
rec.run_end(status="ok")
```

## CLIs

```
python -m benchmark.runs.replay        <run_dir>
python -m benchmark.runs.summary       <run_dir>
python -m benchmark.runs.budget_guard  <run_dir>
```

## Audit guide

1. Open `manifest.json` — top-level config, totals, status.
2. Open `events.jsonl` — full ordered ground truth. See `schema.md`.
3. Open `replay.txt` — same content rendered for human reading.
4. For any task, open `per-task/<id>/`:
   - `prompt.md` — exact system + user prompt sent.
   - `request.json` — full request body (reproducible).
   - `response.md` — assistant text only.
   - `response_raw.json` — full API response (token counts, stop reason).
   - `metadata.json` — tokens, cost, wallclock for this single call.
5. `summary.csv` — single row, easy to concatenate across runs.

## Pilot

```
python /home/zeyufu/Desktop/oh-my-cursor/benchmark/runs/pilot/run_a1_pilot.py --model auto --limit 1 --arm both
```

The Cursor A1 pilot and full runners default to `--model auto` and forward it
explicitly to `cursor-agent` as `--model auto`. Run manifests keep the normalized
model label `cursor/auto`, while each per-task `request.json` records
`model_arg: "auto"` and the exact command shape used for runtime-smoke proof.

Useful bounded commands:

```
python benchmark/runs/pilot/run_a1_pilot.py --model auto --limit 1 --arm both
python benchmark/runs/pilot/run_a1_pilot.py --model auto --arm both
python benchmark/runs/run_a1_full.py --model auto --limit 1 --arm vanilla
python benchmark/runs/run_a1_full.py --model auto --arm both
```

Use `--arm vanilla` or `--arm with-omc` to run one side independently, and
`--limit N` before full runs when collecting bounded smoke evidence. This is
Cursor runtime proof (`runtime-smoke`), not a checked-in model capability claim.
