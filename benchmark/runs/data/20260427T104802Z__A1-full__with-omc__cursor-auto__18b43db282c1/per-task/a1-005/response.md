I’ll draft a concrete expand/contract migration plan tailored for a large Django/Postgres table, and I’m quickly checking the local planning skill guidance first so the structure matches your workspace conventions.1. **Preflight + guardrails (Expand)**  
   - **What:** Freeze a clear migration contract: `users` keeps auth/identity columns; `user_profiles` gets non-auth/profile columns; all reads/writes must work during dual-write period. Add observability (row-count parity, dual-write error rate, backfill lag).  
   - **File scope:** `docs/migrations/*.md` (runbook), settings/metrics wiring (e.g. `settings.py`, monitoring module), feature flags (e.g. `app/flags.py`).  
   - **Rollback:** No schema change yet; rollback is simply disabling flags and pausing rollout.

2. **Create new model/table without changing callers (Expand)**  
   - **What:** Add `UserProfile` model with `OneToOneField(User, primary_key=True or unique=True, on_delete=CASCADE)`, nullable profile fields initially, and indexes needed for known profile queries. Generate migration to create `user_profiles`.  
   - **File scope:** `app/models.py` (or split model files), `app/migrations/00xx_create_user_profiles.py`.  
   - **Rollback:** Safe to drop new table with reverse migration if still unused; no behavioral impact.

3. **Add compatibility access layer on `User` (Expand)**  
   - **What:** Keep external API stable by exposing profile attributes via `User` properties/methods that read from `user.profile` with fallback to legacy `users` columns (while both exist).  
   - **File scope:** `app/models.py` (`User` model helpers/properties), optional `app/services/user_profile_adapter.py`.  
   - **Rollback:** Revert code path to legacy columns only; table can remain idle.

4. **Dual-write path for all mutations (Expand)**  
   - **What:** Update creation/update code paths so profile fields are written to both places (legacy `users` columns + `user_profiles`) inside one transaction; include idempotent create-or-update for profile row.  
   - **File scope:** all user write callers: serializers/forms/views/services/tasks/signals (e.g. `app/services/users.py`, `app/api/serializers.py`, `app/signals.py`, `app/tasks/*.py`).  
   - **Rollback:** Toggle off dual-write flag and continue writing legacy columns only; keep read fallback intact.

5. **Backfill 10M rows online, chunked, resumable (Expand)**  
   - **What:** Run a management command or background job to copy legacy profile data into `user_profiles` in batches (e.g. 5k–20k), ordered by PK, with checkpoints and retry. Use `bulk_create(..., ignore_conflicts=True)`/`ON CONFLICT DO UPDATE` to be rerunnable.  
   - **File scope:** `app/management/commands/backfill_user_profiles.py` (or worker job), optional `app/sql/backfill_user_profiles.sql`, progress table/migration if needed.  
   - **Rollback:** Stop job; no destructive operation. Rerun later from checkpoint.

6. **Read switch to new table with fallback kept (Expand)**  
   - **What:** Flip reads to prefer `user_profiles`; fallback to legacy columns only when profile missing. Add `select_related("profile")` where needed to avoid N+1.  
   - **File scope:** query callers (`views`, `services`, `serializers`, admin), model accessors.  
   - **Rollback:** Flip feature flag back to legacy-first reads.

7. **Data parity validation + enforcement hardening (Expand)**  
   - **What:** Validate counts and sampled field parity; ensure `user_profiles.user_id` coverage for active users. After parity is stable, enforce stricter constraints (`NOT NULL`, unique/index constraints, optional FK deferrability decisions).  
   - **File scope:** validation scripts (`scripts/` or management command), migration(s) for constraints (`app/migrations/00xy_enforce_user_profile_constraints.py`).  
   - **Rollback:** If validation fails, keep fallback reads and dual-write on; delay constraint migration or reverse it.

8. **Stop legacy writes, keep legacy read fallback briefly (Contract)**  
   - **What:** Disable writes to legacy `users` profile columns; keep temporary fallback reads for safety window.  
   - **File scope:** same callers from step 4; feature flag defaults; runbook update.  
   - **Rollback:** Re-enable dual-write quickly via flag/code path.

9. **Drop legacy profile columns from `users` (Contract)**  
   - **What:** After a stable window (days/weeks) and parity checks, remove old profile columns from `users` in a dedicated migration, ideally in low-traffic window.  
   - **File scope:** `app/migrations/00xz_drop_legacy_user_profile_columns.py`, `app/models.py` cleanup.  
   - **Rollback:** Prefer forward-fix. True rollback requires re-adding columns + restore job, so take a pre-drop snapshot/backup and keep restoration script ready.

10. **Cleanup callers + remove compatibility layer (Contract)**  
    - **What:** Remove fallback properties/flags/dual-write code; make `UserProfile` the single source for profile data.  
    - **File scope:** `models`, services, serializers, forms, admin, tasks, tests, docs.  
    - **Rollback:** If issues appear immediately post-cleanup, restore compatibility code from branch/tag; DB schema rollback may be costly after column drop, so keep this as separate deploy after step 9.

11. **Test and deploy sequencing (cross-phase requirement)**  
    - **What:**  
      - Migration tests (forward/backward where feasible)  
      - Dual-write correctness tests  
      - Backfill dry-run on staging-like snapshot  
      - Performance checks (`EXPLAIN ANALYZE`, lock-time monitoring)  
      - Canary deploy + metric gates between steps  
    - **File scope:** `tests/test_migrations*.py`, `tests/services/test_user_profile*.py`, CI pipeline config, runbooks.  
    - **Rollback:** Gate each phase behind metrics/flags; rollback is phase-local (flags/code) until destructive contract steps.

### Expand/Contract summary
- **Expand:** steps 1–7 (new table, compatibility reads, dual-write, backfill, read cutover, validation/constraints).  
- **Contract:** steps 8–10 (remove legacy writes, drop old columns, remove compatibility code).  

### Practical notes for 10M rows
- Keep DDL small and separate; avoid long transactions in backfill.  
- Use chunked, checkpointed, idempotent jobs; monitor replication lag and lock contention.  
- Never combine “drop old columns” with “read-path rewrite” in one deploy.