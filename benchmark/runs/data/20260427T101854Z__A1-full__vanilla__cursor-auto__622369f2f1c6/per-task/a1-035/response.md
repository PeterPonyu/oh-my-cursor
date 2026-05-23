I’ll run a focused root-cause analysis first (read-only), then return 3 distinct hypothesis lanes with ranked evidence, ruled-out alternatives, one critical unknown, and a high-signal probe for each lane. I’m starting by scanning the repo/runtime artifacts for inference-path differences between dev and prod.I’ve loaded the analysis protocol and will keep this strictly read-only with explicit evidence vs inference. Next I’m mapping the inference stack and environment/config surfaces that can differ between dev and prod despite matching model SHA and `pip freeze`.### Question
Why does Python ML inference produce identical-looking outputs in dev but diverge in production for ~5% of inputs, even though model file SHA and `pip freeze` match?

### Ranked Hypothesis Lanes

| Rank | Hypothesis lane | Confidence | Why this ranks here |
|---|---|---|---|
| 1 | **Input canonicalization mismatch** (JSON parsing, feature ordering, dtype/NaN/null handling, timezone/locale, tokenizer versioned assets) | **High** | Affects only a subset (~5%), which is the classic pattern for edge-case inputs rather than global model/runtime mismatch. |
| 2 | **Execution backend divergence under same package versions** (CPU vs GPU kernel path, BLAS/OpenMP threading, nondeterministic reduction order, mixed precision defaults) | **Medium** | Can occur with identical `pip freeze`, because compiled libs/hardware/runtime env still differ; subset-only drift can happen near decision boundaries. |
| 3 | **Serving-path conditional behavior** (prod-only routing, feature flags, fallback model/session, timeout/retry truncation, micro-batching side effects) | **Medium-Low** | Also explains partial incidence (~5%), especially if only certain traffic paths trigger alternate logic. |

---

### Lane 1: Input canonicalization mismatch (Strongest)

- **Evidence (given):** divergence is **partial** (~5%), not universal.
- **Inference:** selective divergence is more consistent with specific input-shape/content classes than with the model binary itself.
- **Eliminated alternatives (for this lane):**
  - “Model file is different” -> weakened by same model SHA.
  - “Pure Python package mismatch” -> weakened by same `pip freeze`.
- **Critical unknown:** Are the exact bytes/typed tensors at model entry identical between dev and prod for the same request IDs?
- **Discriminating probe:** Log and compare (for matched request IDs) a stable fingerprint of model inputs *post-preprocess, pre-infer*: tensor shape, dtype, null mask counts, min/max, and SHA256 of serialized tensor bytes.

---

### Lane 2: Backend/runtime nondeterminism despite same `pip freeze`

- **Evidence (given):** same Python package list does **not** guarantee same low-level runtime (CUDA/cuDNN/oneDNN/MKL/OpenBLAS, CPU SIMD, thread counts, env vars).
- **Inference:** if prod uses different hardware or thread settings, numerics can drift only for boundary cases, yielding ~5% output divergence.
- **Eliminated alternatives (for this lane):**
  - “Completely random behavior” -> unlikely if divergence is stable to specific conditions.
  - “Library version mismatch at pip layer” -> already constrained by `pip freeze`.
- **Critical unknown:** Are hardware targets, thread/env knobs, and precision modes identical?
- **Discriminating probe:** Replay identical captured tensors in both envs with strict deterministic settings (`single-thread`, deterministic kernels, fixed seeds, FP32 forced), then compare raw logits with tolerance histograms. If gap collapses, backend nondeterminism is causal.

---

### Lane 3: Prod-only serving path differences

- **Evidence (given):** issue appears in production only and only for a slice of traffic.
- **Inference:** a conditional path (flag/routing/fallback/retry/batching) may alter requests or model invocation for a subset.
- **Eliminated alternatives (for this lane):**
  - “All requests use identical path” -> contradicted if divergence clusters by endpoint/tenant/traffic class.
- **Critical unknown:** Does every divergent request traverse the same code path/model session/config key as dev?
- **Discriminating probe:** Add per-request “inference provenance” stamp in both envs: route ID, model session ID, preprocess version hash, batch size, timeout/retry/fallback flags. Correlate divergence with one provenance cluster.

---

### Cross-lane eliminated alternatives (highest-confidence eliminations)

- **Model artifact mismatch** is unlikely (same model SHA).
- **Python dependency mismatch** is unlikely at the package/version layer (same `pip freeze`).
- **Global deterministic bug in core model math** is less likely than path/input-conditional causes, because only ~5% diverge.

### Biggest unresolved unknown
Whether dev and prod are receiving and invoking inference on **bit-identical post-preprocess tensors through the same serving path**.  
That single check most sharply separates Lane 1 from Lanes 2/3.

### Fastest next probe order
1. Compare pre-inference tensor fingerprints per request ID.  
2. If identical, run deterministic replay across envs to isolate backend effects.  
3. If still divergent only in prod traffic, inspect provenance/routing clusters.