I’ll draft a concrete expand/contract migration plan tailored for a large Postgres + Django dataset, including exact file scope and rollback notes per step. I’m quickly checking the planning skill guidance first, then I’ll provide the full step-by-step plan.## Migration Plan (`users` -> `users` + `user_profiles`)

Assumptions: Postgres, Django ORM, `users` currently holds both identity/auth and profile fields, and traffic is high enough that long exclusive locks are unacceptable.  
Strategy: **expand/contract** with dual-write and staged read-cutover.

1. **Inventory and classify columns before touching schema**
   - **Phase:** Pre-expand
   - **What:** Decide which columns remain in `users` (auth/core identity) vs move to `user_profiles` (bio, avatar, prefs, demographics, etc.). Mark nullable/default behavior and indexes/constraints needed after split.
   - **File scope:**
     - `users/models.py` (or app model module) for target model boundaries
     - architecture docs / migration runbook (`docs/` or ops playbook)
     - call sites list (query-heavy services, serializers, admin, reporting jobs)
   - **Rollback:** No schema changes yet; rollback is just reverting the plan/doc updates.

2. **Add new `user_profiles` table with 1:1 relation, no destructive changes**
   - **Phase:** Expand
   - **What:** Create `UserProfile` model with `OneToOneField(User, on_delete=CASCADE, db_index=True, unique=True)` and moved columns as initially nullable where needed. Add only safe indexes in this migration; defer risky uniqueness constraints until data is backfilled/clean.
   - **File scope:**
     - `users/models.py` (new `UserProfile`, optional reverse accessor)
     - `users/migrations/00xx_create_user_profile.py`
   - **Rollback:** Reverse migration drops `user_profiles` table (safe because source of truth still `users`).

3. **Ship dual-write in application layer (writes to old + new)**
   - **Phase:** Expand
   - **What:** Update all write paths so profile updates persist in both places. Keep reads from `users` only for now. Prefer centralized write methods/services to avoid missing callers.
   - **File scope:**
     - `users/services/*.py` or domain write handlers
     - serializers/forms/views performing profile updates
     - signals if used (careful about recursion)
     - background jobs that mutate user/profile fields
   - **Rollback:** Feature flag dual-write off; continue single-write to `users`. Schema remains compatible.

4. **Backfill `user_profiles` in chunks (online, id-ranged/keyset)**
   - **Phase:** Expand
   - **What:** Add `RunPython` data migration or (better for 10M) management command invoked by ops to backfill incrementally (e.g., 10k-100k batches), with retries and idempotency (`ON CONFLICT DO UPDATE`/upsert pattern).
   - **File scope:**
     - `users/management/commands/backfill_user_profiles.py` (recommended)
     - optional migration stub pointing to command-run requirement
     - ops script/runbook for resumable execution and progress tracking
   - **Rollback:** Stop backfill job; no destructive changes. Existing `users` data remains authoritative.

5. **Add drift detection and parity checks before read cutover**
   - **Phase:** Expand
   - **What:** Implement verification queries and metrics: count parity, null violations, sampled row diffs, and dual-write failure counters. Gate cutover on SLO (e.g., mismatch rate 0 for N hours).
   - **File scope:**
     - health-check module / observability hooks
     - one-off SQL scripts in `scripts/` or `ops/sql/`
     - dashboards/alerts config (if code-managed)
   - **Rollback:** Disable checks/alerts only; no schema rollback needed.

6. **Enable read-path fallback (`user_profiles` first, `users` fallback)**
   - **Phase:** Expand -> Transitional cutover
   - **What:** Under feature flag, shift read callers to `select_related('profile')` and read from `user_profiles`; fallback to legacy `users` fields if profile row absent. Keep dual-write on.
   - **File scope:**
     - query builders/repositories/managers
     - serializers/API response builders
     - admin pages and any ETL/reporting readers
   - **Rollback:** Flip flag back to legacy reads instantly; dual-write preserves consistency.

7. **Enforce data integrity on new table after stable cutover**
   - **Phase:** Late Expand
   - **What:** Once parity is clean, add stricter constraints on `user_profiles` (e.g., `NOT NULL`, validated unique/check constraints, additional indexes). Use `CONCURRENTLY` for large indexes where possible (separate non-atomic migration in Django).
   - **File scope:**
     - `users/migrations/00xy_profile_constraints.py`
   - **Rollback:** Drop/relax newly added constraints/indexes; reads can still fallback if needed.

8. **Switch source of truth: stop writing profile columns in `users`**
   - **Phase:** Contract (start)
   - **What:** Remove legacy-side writes; keep temporary compatibility reads only if needed for safety window.
   - **File scope:**
     - same write call sites as step 3
     - feature flag config
   - **Rollback:** Re-enable dual-write via feature flag/deploy rollback.

9. **Remove legacy profile columns from `users`**
   - **Phase:** Contract
   - **What:** Drop moved columns in small, explicit migrations; remove dead code paths. Do this only after an observation window and backup checkpoint.
   - **File scope:**
     - `users/migrations/00xz_drop_legacy_user_profile_columns.py`
     - `users/models.py` (remove legacy fields)
     - all callers still referencing old fields
   - **Rollback:** Prefer forward-fix (re-add columns + restore from `user_profiles` backfill script) rather than full DB rollback; keep a reversible script prepared before dropping.

10. **Post-contract cleanup and hardening**
    - **Phase:** Contract (final)
    - **What:** Remove fallback logic, delete temporary metrics/scripts, optimize query plans (`EXPLAIN ANALYZE` on hot paths), and finalize docs.
    - **File scope:**
      - services/managers with fallback branches
      - obsolete backfill/drift scripts
      - operational docs / runbooks
    - **Rollback:** If regressions appear, redeploy previous app version while keeping schema (now stable on split model); avoid emergency schema rollback unless critical.

---

## Expand/Contract Snapshot

- **Expand:** steps 2-7 (new table, dual-write, backfill, parity checks, read cutover, constraints)
- **Contract:** steps 8-10 (stop legacy writes, drop old columns, remove compatibility code)

---

## 10M-row Operational Notes (important)

- Use **chunked backfill** with resume markers; avoid one giant transaction.
- Keep migrations that use `CREATE INDEX CONCURRENTLY` as **non-atomic** in Django.
- Prefer **feature flags** for read/write cutovers to get instant rollback without schema churn.
- Schedule high-impact steps off-peak; monitor lock wait and replication lag.
- Treat rollback as **application rollback first**, **schema rollback last** once contract begins.

If you want, I can turn this into a concrete Django migration sequence (`00xx` filenames + sample model definitions + feature-flag rollout checklist) aligned to your current app layout.