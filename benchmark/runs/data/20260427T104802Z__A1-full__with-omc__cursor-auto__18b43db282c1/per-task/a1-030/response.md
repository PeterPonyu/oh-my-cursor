Restated failure: after a deploy that only changed the cache layer, search endpoint p95 latency regressed from ~80ms to ~720ms (~9x slower) with no accompanying error logs.

- **Symptom vs root cause**
  - **Symptom:** higher end-to-end latency at p95 for search requests.
  - **Root cause (unknown yet):** the specific cache-layer behavior change that increased request service time (misses, blocking, serialization, network path, etc.).  
  - p95 regression without errors strongly suggests a **performance path change**, not a hard failure path.

1) **Cache hit-rate collapse or key-version mismatch after deploy** — **Confidence: High**
- **Why it fits (for):**
  - Only cache layer changed; biggest common regression is effective misses (key format/prefix/TTL/version changed).
  - No errors expected if misses are “valid” behavior.
  - 9x p95 increase is consistent with fallback to slower backend/search index/database.
- **Why it may not (against):**
  - If backend latency dashboards stayed flat and cache hit-rate is unchanged, this weakens it.
- **Cheapest discriminating probe:**
  - Compare pre/post deploy **cache hit-rate**, **miss-rate**, and **backend QPS per search request** over same traffic slice.
  - Also sample 20 real keys and verify old/new key construction parity (namespace, normalization, tenant/user scoping).

2) **Cache client now doing synchronous/blocking work (serialization/compression/lock contention/pool starvation)** — **Confidence: Medium**
- **Why it fits (for):**
  - Cache-layer-only changes can add CPU or blocking in hot path without errors.
  - p95 inflation is typical when thread/event-loop blocking or connection pool wait increases under load.
- **Why it may not (against):**
  - If app CPU, GC, event-loop lag, and cache client wait metrics are unchanged, this is less likely.
- **Cheapest discriminating probe:**
  - Add short-lived per-request timing spans around:
    1) key build  
    2) cache get/set round trip  
    3) (de)serialization/compression  
    4) pool-acquire wait  
  - One canary instance with high-cardinality sampling (1-5%) is usually enough.

3) **Cache topology/path regression (cross-AZ/region routing, TLS handshake churn, DNS/connection reuse issue)** — **Confidence: Low-Medium**
- **Why it fits (for):**
  - Network-path regressions can produce large tail-latency increases without application errors.
  - Cache still “works,” just slower, so logs remain clean.
- **Why it may not (against):**
  - Would often show up as elevated cache RTT metrics globally, not just endpoint p95.
- **Cheapest discriminating probe:**
  - Compare pre/post deploy **cache RTT p50/p95**, **new connection rate**, and **TLS handshake counts**; verify resolved cache endpoint and AZ/region affinity from one pod/node.

Most likely framing: the deploy introduced a cache behavior change that increased time spent off the fast path (likely misses first, blocking second). The fastest first check is hit-rate + backend amplification; if that’s clean, instrument cache-client timing breakdown next.