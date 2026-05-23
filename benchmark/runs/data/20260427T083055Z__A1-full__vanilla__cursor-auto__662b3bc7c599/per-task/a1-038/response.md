Use a **lease-based reconciler** that runs on a fixed interval (e.g., every 30s–2m), finds jobs that look stuck, and safely re-enqueues them.

## Reconciliation Loop Design

- Query `pending_jobs` for rows where:
  - `status = 'in_progress'`
  - `lease_expires_at < now()` (or `updated_at < now() - stuck_timeout`)
  - optional: `retry_count < max_retries`
- Process in small batches (`LIMIT N`) with row locking (`FOR UPDATE SKIP LOCKED`) so multiple reconcilers can run safely.
- For each row, atomically:
  - increment `retry_count`
  - set `status = 'queued'`
  - clear worker lease fields (`worker_id`, `lease_expires_at`)
  - set `next_attempt_at = now()` (or backoff time)
  - write an audit event (`job_reenqueued_by = 'reconciler'`, reason = `lease_expired`)

## Required Outputs

- **Stop condition**
  - End the cycle when either:
    1) no more eligible stuck rows are found, or  
    2) cycle-level max iteration cap is reached.
- **Idempotence requirement**
  - Re-enqueue must be guarded by a predicate in the update (e.g., only update if still `status='in_progress'` and same stale lease condition).
  - Repeated reconciler runs on the same row must produce no harmful duplicate side effects.
  - Any enqueue operation should use a dedupe key (e.g., `job_id` + attempt number) to prevent duplicate queue messages.
- **Max-iteration cap per cycle**
  - Example: `max_iterations = 20`, `batch_size = 100` (max 2,000 rows per cycle).
  - Prevents long-running cycles and protects DB/queue under backlog spikes.
- **Observable success signal**
  - Emit metrics/events:
    - `reconciler.scanned_count`
    - `reconciler.reenqueued_count`
    - `reconciler.loop_duration_ms`
    - `reconciler.oldest_stuck_age_seconds`
  - Success SLO signal: oldest stuck age trends down and reenqueued jobs eventually transition to `completed`.
- **Fallback for repeat failures**
  - If `retry_count >= max_retries` (or repeated lease expiries), move row to `dead_letter`/`needs_manual_review` state.
  - Persist failure reason and last error, trigger alert/page, and expose in ops dashboard.
  - Optional circuit-breaker: if failure rate exceeds threshold, pause automatic re-enqueue and alert.

If you want, I can turn this into concrete SQL + pseudocode for Postgres/MySQL and include a recommended schema (`lease_expires_at`, `retry_count`, `reconcile_attempted_at`, etc.).