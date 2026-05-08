# Recorder JSONL event schema

`events.jsonl` is the canonical, append-only ground truth for a benchmark run.
Every line is one JSON object. All events carry:

| field   | type   | notes                                  |
|---------|--------|----------------------------------------|
| `ts`    | string | UTC ISO-8601 timestamp with `Z` suffix |
| `event` | string | discriminator (see below)              |

Per-task events also include `task_id`. Numeric fields are integers unless
otherwise noted; costs are USD floats.

## Event types

### `run_start`

Emitted once at the beginning of the run.

```json
{"event":"run_start","run_id":"...","benchmark":"...","arm":"...",
 "model":"anthropic/claude-haiku-4-5-20251001","fallback_model":null,
 "budget_usd":2.0,"started_at":"20260427T..."}
```

### `task_start`

Emitted when a task begins. `metadata` is free-form and may include a
`system` field (mirrored into `prompt.md`) plus arbitrary tags such as
`skill`, `arm_kind`, etc.

```json
{"event":"task_start","task_id":"a1-pilot-001","prompt_chars":172,
 "metadata":{"skill":"plan","arm_kind":"workflow","system":"..."}}
```

### `request`

Records that a request payload was written to disk. The full body is at
`per-task/<id>/request.json`; the event itself logs only the top-level
keys for fast scanning.

```json
{"event":"request","task_id":"a1-pilot-001",
 "payload_keys":["max_tokens","messages","model","system","temperature"]}
```

### `response`

Records a completed model response. The full raw body is at
`per-task/<id>/response_raw.json`; the assistant text is at
`per-task/<id>/response.md`.

```json
{"event":"response","task_id":"a1-pilot-001",
 "tokens":{"input":120,"output":340,"cache_read":0,"cache_write":0},
 "cost_usd":0.001820,"wallclock_ms":4123,"stop_reason":"end_turn"}
```

### `tool_call` / `tool_result`

Optional. Track function-call style tool invocations.

```json
{"event":"tool_call","task_id":"...","name":"grep","args":{"pattern":"..."}}
{"event":"tool_result","task_id":"...","name":"grep","result":{"matches":3}}
```

### `rubric_score`

Recorded after rating a task response.

```json
{"event":"rubric_score","task_id":"...",
 "rubric":{"correctness":0.9,"clarity":0.8},"total":0.85,"rater":"self"}
```

### `task_end`

Emitted exactly once per task. `status` is `ok` on success or any
short string on failure.

```json
{"event":"task_end","task_id":"...","status":"ok"}
```

### `error`

Emitted for in-task or transport errors. Always paired with a `task_end`
that has `status != "ok"`.

```json
{"event":"error","task_id":"...","error":"HTTP 429: rate_limited"}
```

### `budget_warning`

Emitted when cumulative spend crosses 80% of `budget_usd`.

```json
{"event":"budget_warning","spent_usd":1.61,"budget_usd":2.0,"fraction":0.805}
```

### `fallback_triggered`

Emitted when the recorder swaps to `fallback_model`.

```json
{"event":"fallback_triggered","from_model":"...","to_model":"...","spent_usd":2.01,"budget_usd":2.0}
```

### `budget_exceeded`

Emitted when budget is hit and no fallback is configured. The recorder
returns `"abort"` from `response()` so the caller can stop dispatching.

```json
{"event":"budget_exceeded","spent_usd":2.01,"budget_usd":2.0}
```

### Pricing note: `cursor/*` models

Entries in ``recorder.PRICING`` keyed under ``cursor/`` are **proxy rates**.
Cursor itself bills in credits, not USD; the recorder uses Anthropic Sonnet 4
public rates (USD/Mtok) as a rough cost-of-equivalent-tokens estimate so
``cost_usd`` is comparable across arms. Treat these numbers as an order-of-
magnitude indicator, not a Cursor invoice line item.

### `run_end`

Emitted at the end of the run with rolled-up totals. Triggers
`summary.csv`, refreshed `manifest.json`, and `replay.txt` rendering.

```json
{"event":"run_end","status":"ok","totals":{"n_tasks":3,"n_responses":3,
 "n_errors":0,"n_fallback_events":0,"tokens_in":...,"tokens_out":...,
 "cost_usd":0.0123,"wallclock_seconds":12.4}}
```
