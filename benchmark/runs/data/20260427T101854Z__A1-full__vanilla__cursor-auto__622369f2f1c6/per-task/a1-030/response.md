I’ll do a focused read-only investigation and return a ranked hypothesis list with confidence, evidence for/against, and the cheapest probe to distinguish causes from symptoms. I’m starting by loading the analysis skill instructions, then I’ll inspect the repo for recent cache-layer changes and search endpoint timing paths.I’ve loaded the read-only analysis framework and I’m now mapping where the search endpoint and cache layer are implemented so we can ground hypotheses in code evidence.Restated failure: **After a deploy that only changed the cache layer, search endpoint p95 latency regressed from 80ms to 720ms, with no logged errors.**

### Ranked hypotheses

| Rank | Hypothesis | Confidence |
|---|---|---|
| 1 | Cache hit-rate collapse (key mismatch/namespace/versioning/TTL bug) is forcing expensive fallback work on most requests. | **H** |
| 2 | Cache operation latency increased (network hop, connection pooling, timeout/retry behavior), so even hits are slower. | **M** |
| 3 | Serialization/compression/object-size regression in cache read/write path increased CPU and payload cost. | **L** |

#### 1) Cache hit-rate collapse (**H**)
- **Evidence for**
  - Regression begins immediately after a cache-layer-only deploy.
  - Large p95 jump (9x) with no errors is consistent with “works but misses cache” behavior.
- **Evidence against**
  - No direct hit/miss metrics provided yet.
  - If misses were total, you might also expect DB/backend saturation signals (not mentioned).
- **Cheapest discriminating probe**
  - Compare **pre/post deploy cache hit ratio** and **backend query count per search request** for the same traffic slice (5–10 min window).  
  - If hit ratio dropped sharply and backend work/request rose, this is strongly favored.

#### 2) Cache operation latency regression (**M**)
- **Evidence for**
  - Cache code changed; p95 is especially sensitive to tail latency in external cache calls.
  - No errors fits slow I/O, pool contention, or retries that still eventually succeed.
- **Evidence against**
  - A pure cache I/O slowdown often raises p50 too; only p95 was reported.
- **Cheapest discriminating probe**
  - Break down request timing into `cache_get`, `cache_set`, and “origin fetch” spans for a small sample.
  - If `cache_get` p95 dominates while hit rate is stable, this moves to top rank.

#### 3) Serialization/compression/value-size regression (**L**)
- **Evidence for**
  - Cache-layer changes sometimes introduce heavier codecs or larger payloads, hurting tail latency.
- **Evidence against**
  - Usually causes broader latency shift (p50/p95) and possibly CPU pressure; none reported.
- **Cheapest discriminating probe**
  - Compare median/p95 **cache value size**, (de)serialization duration, and CPU time per request before vs after deploy.

### Symptom vs root cause (explicit)

- **Symptom:** `search` endpoint p95 increased from 80ms to 720ms.
- **Likely root-cause class:** cache-layer behavioral change causing either:
  - lower cache effectiveness (miss path overused), or
  - slower cache path (I/O/retry/pool), or
  - heavier cache payload processing.
- **Not a root cause by itself:** “no errors in logs” only says failure mode is performance degradation, not functional failure.