Use a **checkpointed chunk scheduler** with a durable chunk-state table and compare-and-swap claiming.

## Backfill Loop Design

- **Chunking**
  - Define stable chunk boundaries once (e.g., primary-key ranges or snapshot of IDs): `chunk_id`, `start_key`, `end_key`.
  - Persist them in `backfill_chunks` so the same logical chunk is always retried/resumed, never re-split differently.

- **Durable state machine per chunk**
  - States: `pending -> in_progress -> succeeded` (or `failed_retryable`, `failed_permanent`).
  - Metadata: `attempt_count`, `last_error`, `worker_id`, `lease_expires_at`, `started_at`, `finished_at`, `input_version`, `output_version`, `rows_touched`, `checksum`.
  - Claim with atomic update:
    - “Pick oldest `pending/failed_retryable` chunk with attempts < threshold and lease expired; set `in_progress`, increment attempt, set lease.”

- **Worker processing (idempotent)**
  - Recompute derived field deterministically from source columns.
  - Write with idempotent statement semantics (e.g., `SET derived = f(source)` only; no additive updates, no side effects).
  - Optionally guard writes with version/hash predicate to skip already-correct rows.
  - On success, mark chunk `succeeded` in same transaction boundary as final write marker (or with monotonic job watermark + reconciliation check).

## Required Outputs

### 1) Stop condition
Stop a cycle when **any** is true:
1. No claimable chunks remain (`pending + failed_retryable with attempts<threshold == 0` and no live leases).
2. `max_iter_per_cycle` reached.
3. Global runtime budget reached (optional operational guard).

### 2) Idempotence guarantee
- **Chunk-level idempotence:** A chunk can be retried any number of times; result converges because transformation is pure (`derived = f(row)`), not incremental.
- **Row-level idempotence:** Re-running same chunk rewrites same value or no-ops via predicate (`WHERE derived IS DISTINCT FROM f(source)`).
- **Claim idempotence:** Lease/CAS prevents double ownership; lease expiry allows safe recovery after interruption.

### 3) Max-iter cap (per cycle)
- Configure `max_iter_per_cycle` (e.g., 5k chunks per scheduler tick).
- Loop:
  - `for i in 1..max_iter_per_cycle: claim -> process -> finalize`
  - break early if no chunk claimed.
- This bounds blast radius, lock time, and scheduler monopolization.

### 4) Observable success signal
Track and emit:
- **Primary completion signal:** `count(succeeded) == count(total_chunks)`.
- **Coverage signal:** `sum(rows_touched)` close to expected cardinality (or exact if known).
- **Correctness signal:** sampled/full validation query: `count(*) where derived != f(source) == 0`.
- **Operational signal:** metrics/dashboard: chunk throughput, retry rate, lagging chunks, ETA.

### 5) Repeated failure escalation (no infinite loop)
- Per chunk: `attempt_count` with thresholds:
  - `<= N1`: retry with exponential backoff + jitter.
  - `N1 < attempts <= N2`: move to `failed_retryable` + alert warning.
  - `> N2`: mark `failed_permanent`, page/on-call, open incident ticket, exclude from automatic retries.
- Scheduler excludes `failed_permanent` from normal claim path.
- Job status becomes `degraded_complete` if all chunks are `succeeded` or `failed_permanent`; requires human resolution workflow for permanent failures.

---

If you want, I can turn this into a concrete SQL schema + pseudo-code loop for Postgres/MySQL and include lease/claim queries.