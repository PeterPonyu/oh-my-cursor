Use a **cursor + lease + chunk checkpoint** pattern.

## Resumable Backfill Loop Design

- **Chunking model**
  - Define stable chunk boundaries by primary key range (or monotonic ID), e.g. `[start_id, end_id)`.
  - Persist each chunk in a `backfill_chunks` table with states: `pending | in_progress | done | failed_permanent`.
  - Store per-chunk metadata: `attempt_count`, `last_error`, `lease_expires_at`, `started_at`, `finished_at`, `worker_id`.

- **Claiming work safely**
  - Worker atomically claims one chunk: transition `pending -> in_progress` (or reclaim expired lease).
  - Use a short lease TTL (e.g., 10 min) and heartbeat updates while processing.
  - On worker crash/interruption, lease expires and chunk becomes claimable again.

- **Chunk execution**
  - Recompute derived field with deterministic SQL:
    - `new_value = f(source_columns...)`
  - Write only if needed:
    - `UPDATE ... SET derived = :new_value WHERE id BETWEEN ... AND (derived IS DISTINCT FROM :new_value)`
  - Mark chunk `done` only after successful write transaction commits.

## Required Outputs

- **Stop condition**
  - Cycle ends when no claimable chunks remain (`pending` + expired `in_progress` = 0), or when `max_iter_per_cycle` is reached.
  - Global completion when `COUNT(state='done') == total_chunks`.

- **Idempotence guarantee**
  - Reprocessing a chunk is safe because:
    1. Computation is deterministic (`f(...)` same input => same output).
    2. Update is conditional (`IS DISTINCT FROM`), so already-correct rows are no-ops.
    3. `done` chunks are never claimable again unless explicitly reset by operator.
  - Therefore retries/interruption do not corrupt data or double-apply effects.

- **Max-iter cap (per cycle)**
  - `max_iter_per_cycle` (example: 1,000 chunks per scheduler run).
  - Prevents a single run from monopolizing resources; next cycle resumes from persisted state.

- **Observable success signal**
  - Primary: checkpoint table shows all chunks `done`.
  - Secondary metrics:
    - `backfill_done_chunks / total_chunks` reaches `1.0`
    - `backfill_pending_chunks == 0`
    - `backfill_failed_permanent_chunks == 0` (or accepted threshold)
    - Optional validation query: sampled recompute mismatch count = 0.

- **Repeated-failure escalation (no infinite loop)**
  - Increment `attempt_count` on each failed attempt.
  - If `attempt_count < N` (e.g., 5): retry with backoff.
  - If `attempt_count >= N`: transition to `failed_permanent`, emit alert (PagerDuty/Slack), and exclude from automatic claiming.
  - This guarantees the system does not spin forever on one bad chunk; requires explicit operator action to requeue.

## Minimal Control-Loop Pseudocode

```python
for i in range(max_iter_per_cycle):
    chunk = claim_next_chunk_or_expired_lease()
    if not chunk:
        break  # stop condition for this cycle

    try:
        with txn():
            recompute_and_update_rows(chunk)  # deterministic + conditional update
            mark_done(chunk)
    except Exception as e:
        attempts = mark_failed_attempt(chunk, e)
        if attempts >= MAX_ATTEMPTS:
            mark_failed_permanent(chunk)
            alert(chunk, e)
        else:
            schedule_retry_with_backoff(chunk)
```

If you want, I can also provide a concrete schema (`backfill_chunks`) and SQL claim/update statements for Postgres or MySQL.