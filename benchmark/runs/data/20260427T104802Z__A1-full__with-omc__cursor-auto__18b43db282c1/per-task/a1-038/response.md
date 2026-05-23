Use a **time-bounded, lease-based reconciliation loop**:

## Reconciliation Loop Design

- Run every `T` seconds (e.g. 30s–2m), selecting rows in `pending_jobs` where `status='pending'` and `last_heartbeat_at < now() - stuck_timeout`.
- Re-enqueue in small batches (`LIMIT N`) using atomic claim/update (`FOR UPDATE SKIP LOCKED` + status/version bump) so multiple reconcilers can coexist.
- Mark each reclaimed row with `reconciled_at`, increment `retry_count`, and publish enqueue event once claim succeeds.

## Required Outputs

- **Stop condition**: stop the current cycle when either (a) no more eligible stuck rows are found, or (b) cycle budget is exhausted (time budget or iteration cap reached).
- **Idempotence requirement**: enqueue operation must be idempotent per job key (`job_id`/dedupe key). Re-running reconciliation must not create duplicate effective work; consumers should ignore duplicate deliveries via the same idempotency key or monotonic attempt/version check.
- **Max-iteration cap per cycle**: hard cap like `max_iterations = 20` with `batch_size = 100` (max 2,000 rows/cycle). Prevents runaway scans and protects DB/queue.
- **Observable success signal**: emit metrics/logs:
  - `reconciler.rows_scanned`
  - `reconciler.rows_reenqueued`
  - `reconciler.cycle_duration_ms`
  - `pending_jobs.stuck_count` (should trend down)
  - optional SLO: “stuck job age p95 < X minutes”.
- **Fallback for repeat failures**: if `retry_count >= K` (e.g. 5), move row to `dead_letter_jobs` (or `status='quarantined'`), store last error/reason, stop automatic re-enqueue, and trigger alert/ticket for manual or specialized recovery flow.

## Practical Defaults

- `stuck_timeout`: 2x–3x normal heartbeat interval
- `batch_size`: 100
- `max_iterations`: 20
- `K` (quarantine threshold): 5
- jitter schedule start times to avoid thundering herd

If you want, I can turn this into pseudocode + SQL transaction skeleton next.