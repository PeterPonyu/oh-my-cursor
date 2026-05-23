Use a **time-bounded, lease-based reconciler** that runs every `N` seconds and only touches jobs that are truly stale.

- **Core loop**
  - Select candidate rows from `pending_jobs` where `status = 'pending'` and `updated_at < now() - stuck_threshold` (or `lease_expires_at < now()` if you use leases).
  - Claim rows atomically (e.g., `SELECT ... FOR UPDATE SKIP LOCKED`), bump `reconcile_attempts`, set a new lease/version, and enqueue.
  - Commit transaction; emit metrics/events; repeat until stop condition.

- **Stop condition**
  - End current cycle when either:
    - no more eligible rows are returned, **or**
    - cycle wall-clock budget is reached (e.g., 2s of a 10s interval), **or**
    - max-iteration cap is hit.

- **Idempotence requirement**
  - Re-enqueue must be safe if done multiple times:
    - include deterministic dedupe key (`job_id` + `version`),
    - queue consumer must ignore already-processed versions,
    - DB update and enqueue should be coupled via outbox/transactional publish (or at least version check on consume).

- **Max-iteration cap per cycle**
  - Hard cap both by rows and batches, e.g.:
    - `batch_size = 200`
    - `max_batches_per_cycle = 10`
    - max rows touched per cycle = `2000`
  - Prevents one cycle from monopolizing DB/queue.

- **Observable success signal**
  - Emit and alert on:
    - `reconciler.reenqueued_count`
    - `reconciler.stuck_backlog` (eligible stuck rows)
    - `reconciler.oldest_stuck_age_seconds`
    - `reconciler.cycle_duration_ms` and `error_count`
  - Success = backlog and oldest age trend down after each cycle.

- **Fallback for repeat failures**
  - If `reconcile_attempts >= K` (e.g., 5), stop normal re-enqueue:
    - move row to `quarantine_jobs` / set `status='poisoned'`,
    - attach last error + timestamps,
    - trigger alert/ticket for manual triage or specialized handler.
  - Optionally apply exponential backoff before quarantine to reduce hot-loop retries.

If you want, I can also provide concrete SQL + pseudocode for Postgres (with `SKIP LOCKED` and an outbox pattern).