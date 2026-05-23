Use a **chunk-lease + checkpoint table** pattern.

## Resumable Backfill Loop

### 1) Core data model (control plane)
Create a `backfill_chunks` table keyed by chunk range (or chunk id):

- `chunk_id` (PK)
- `start_pk`, `end_pk` (or predicate)
- `status` enum: `pending | leased | done | failed_permanent`
- `attempt_count`
- `last_error`
- `lease_owner`
- `lease_expires_at`
- `updated_at`
- `done_at`
- optional: `rows_expected`, `rows_updated`

Also keep one `backfill_runs` row for current campaign (`run_id`, version/hash of compute logic, timestamps, global counters).

### 2) Chunk claim + processing flow
Each worker loop:

1. **Claim one chunk atomically**  
   `UPDATE ... SET status='leased', lease_owner=?, lease_expires_at=now()+TTL, attempt_count=attempt_count+1 WHERE status IN ('pending','leased-expired') ... LIMIT 1 RETURNING *`
2. Recompute derived field for that chunk in a transaction (or bounded sub-batches).
3. Validate success criteria for chunk.
4. Mark `done` only after successful write + validation.
5. Heartbeat/extend lease while running (for long chunks).
6. If worker crashes, lease expires and chunk is claimable again.

---

## Required outputs

### Stop condition
Backfill cycle stops when **no claimable chunks exist**:
- `count(status='pending') = 0`
- `count(status='leased' AND lease_expires_at < now()) = 0`
- and optionally `count(status='failed_permanent') = 0` for “green” completion.

Operationally: loop exits after `N` consecutive empty-claim polls (to avoid racey transient empties).

### Idempotence guarantee
Guarantee at two levels:

- **Deterministic recompute**: derived value is pure function of canonical source fields at read time.
- **Idempotent write**: update only when value differs, e.g.  
  `SET derived = new_value WHERE id BETWEEN ... AND derived IS DISTINCT FROM new_value`.

So replaying a chunk is safe: either same value gets written again harmlessly, or no-op updates occur.

### Max-iter cap (per cycle)
Each worker run has hard limits to keep cycles bounded:
- `MAX_CHUNKS_PER_CYCLE` (e.g., 500)
- `MAX_RUNTIME_PER_CYCLE` (e.g., 15 min)
- optional `MAX_ROWS_PER_CYCLE`

When cap hits, worker exits cleanly; scheduler restarts next cycle. This gives natural pause/resume behavior and controlled load.

### Observable success signal
Expose both machine and human signals:

- **Primary**: `done_chunks == total_chunks` and `failed_permanent == 0`.
- **Progress**: `% complete`, rows updated, throughput, ETA.
- **Data correctness**: sampled verification query (or checksum) shows derived matches recomputation.
- Emit metrics/logs:
  - `backfill_chunks_done_total`
  - `backfill_chunks_failed_total`
  - `backfill_chunk_retries`
  - `backfill_lag_chunks_remaining`

### Repeated failure escalation (no infinite loop)
Use retry thresholds with state transition:

- On failure: `attempt_count += 1`, store `last_error`.
- If `attempt_count < RETRY_LIMIT` (e.g., 5): return to `pending` with backoff/jitter.
- If `attempt_count >= RETRY_LIMIT`: mark `failed_permanent`, stop automatic retries.
- Trigger escalation:
  - alert/page with `chunk_id`, error, attempt history
  - add to “manual review” queue
  - optionally quarantine chunk and continue others (so one poison chunk doesn’t block 200M-row progress)

This ensures the system **fails loud** instead of spinning forever.

---

If you want, I can turn this into concrete SQL schema + pseudocode loop for Postgres/MySQL next.