I’ll run a focused read-only investigation and produce three distinct hypothesis lanes with ranked evidence, ruled-out alternatives, one critical unknown, and a discriminating probe for each. I’m starting by loading the analysis workflow, then I’ll inspect inference-related code and environment assumptions.I’ve loaded the read-only analysis protocol. Next I’m mapping where inference runs in this repo and where dev vs production behavior could diverge despite same model and dependencies.I’m finding no classic ML stack here (Torch/ONNX/etc), so I’m tracing the actual “inference” path this repo uses: subprocess/API model calls plus recorder/replay logic where subtle dev/prod drift can be introduced.### Question
You want the most likely cause of dev/prod output drift (~5% inputs) when model artifact SHA and `pip freeze` look identical.

### Ranked Hypothesis Lanes

| Rank | Hypothesis lane | Confidence | Why it ranks here |
|---|---|---|---|
| 1 | **Backend bifurcation at runtime (CLI vs HTTPS/API path)** | **High** | One env var flips execution path and request shape, so “same code+deps” can still produce different inference behavior. |
| 2 | **Context/path-dependent prompt surface (working directory / auto-loaded behavior)** | **Medium** | Inference call is explicitly sensitive to `cwd`, which changes what gets auto-loaded and therefore model input. |
| 3 | **Low-frequency retry/transport path creating non-deterministic re-generation** | **Medium-Low** | There is transient-error retry logic that only triggers occasionally, matching a ~5% profile. |

---

### Lane 1 — Backend bifurcation (strongest)

**Evidence**
- `call_anthropic()` chooses backend solely from API key presence.
```249:267:benchmark/runs/anthropic_client.py
def call_anthropic(...):
    key = api_key if api_key is not None else os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return _call_via_https(...)
    return _call_via_cli(...)
```
- CLI path injects `--system-prompt` and `--disable-slash-commands`, and model alias translation (`sonnet`/`haiku`/`opus`).
```100:109:benchmark/runs/anthropic_client.py
cmd = [
    binary, "--print", "--output-format", "json",
    "--model", _model_alias_for_cli(model),
    "--system-prompt", sys_prompt,
    "--disable-slash-commands",
]
```
- HTTPS path sends a different body schema (explicit `messages`, optional `system`, numeric params).
```190:198:benchmark/runs/anthropic_client.py
body = {
    "model": _bare_model_id(model),
    "max_tokens": int(max_tokens),
    "temperature": float(temperature),
    "messages": [{"role": "user", "content": user}],
}
if system:
    body["system"] = system
```

**Inference**
- Dev and prod can report “same library versions” yet still hit different inference backends and request contracts due to env/config, yielding subtle divergence on a minority of inputs.

**Eliminated alternatives (for this lane)**
- Not explained by package mismatch alone (you already controlled `pip freeze`).
- Not explained by model file SHA alone (runtime backend choice can dominate).

**Critical unknown**
- Whether prod has `ANTHROPIC_API_KEY` (or equivalent) set while dev doesn’t.

**Discriminating probe**
- Compare `request_body.backend` and serialized request payloads for matched inputs across dev/prod (`per-task/*/request.json` and `response_raw.json`).

---

### Lane 2 — Context-dependent input surface (`cwd` / auto-load behavior)

**Evidence**
- Inference wrapper states `cwd` controls auto-loaded behavior.
```3:9:benchmark/runs/host_client.py
Shells out to ... cursor-agent ...
The cwd at invocation determines which Cursor skills auto-load:
  - vanilla arm: cwd is a fresh tempdir with no ``skills/``
  - with-omc arm: cwd is the project root (skills auto-load)
```
- `subprocess.run(..., cwd=str(workdir))` is the operative switch.
```89:93:benchmark/runs/host_client.py
proc = subprocess.run(
    cmd,
    cwd=str(workdir),
    capture_output=True,
```

**Inference**
- If prod sometimes invokes with a different working directory (container entrypoint, worker chdir, job sandbox), effective prompt/tool context differs without any model/dependency change. This can look “mostly same” but diverge on edge prompts (~5%).

**Eliminated alternatives**
- Not numeric kernel nondeterminism from common ML libs; repo has no `torch`/`tensorflow`/`onnxruntime`/`numpy` usage hits.
- Not recorder mutation issue; events are append-only and raw responses are persisted.

**Critical unknown**
- Whether `workdir` is guaranteed identical between dev and prod for all requests.

**Discriminating probe**
- Log and diff `workdir` per request; in this repo that’s already captured in request records/metadata (`request.json`, task metadata `cwd`).

---

### Lane 3 — Transient retry path causing occasional regenerated outputs

**Evidence**
- Full runner retries on transient network-ish failures only.
```94:113:benchmark/runs/run_a1_full.py
for attempt in range(MAX_RETRIES):
    ...
except CursorCLIError as exc:
    ...
    transient = ("timed out" in msg or "tls" in msg or "network" in msg
                 or "socket" in msg or "disconnect" in msg or "503" in msg
                 or "504" in msg or "502" in msg)
    if attempt < MAX_RETRIES - 1 and transient:
        ... time.sleep(RETRY_BACKOFF_S)
        continue
```

**Inference**
- A small fraction of prod requests may go through retry/regeneration path (or fail fast), while dev doesn’t. For probabilistic generation, retry can produce semantically close but differing outputs.

**Eliminated alternatives**
- Not a deterministic parser/serialization bug in recorder output itself (raw responses are written before extraction).
- Not a universal code-path mismatch (would likely affect far more than ~5%).

**Critical unknown**
- Real transient error rate distribution in prod vs dev and whether diverging samples correlate with retries.

**Discriminating probe**
- Join divergence cases against logs containing transient signatures (`timed out`, `503`, `disconnect`) and retry count; expect enrichment in the divergent 5%.

---

### What is directly ruled out from repository evidence
- **Classic local ML stack drift** is weakly supported here: there are no matches for common local inference libs (`torch`, `onnxruntime`, `tensorflow`, `numpy`, etc.) in this codebase.
- **Simple “same model SHA + same pip freeze means identical runtime behavior”** is insufficient in this system because runtime behavior is also controlled by env vars, request construction, backend selection, and invocation context.

If you want, I can next produce a one-command triage checklist that computes these three probes against your existing run artifacts (read-only).