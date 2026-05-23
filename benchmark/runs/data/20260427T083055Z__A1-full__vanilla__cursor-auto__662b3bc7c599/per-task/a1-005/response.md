I’ll draft a concrete expand/contract migration plan tailored for Django + Postgres at 10M rows, including file-level scope and rollback for each step. I’m quickly checking the planning skill instructions first, then I’ll provide the full numbered sequence.1. **Preflight and guardrails (Expand)**
   - **What:** Define success metrics, migration SLOs, and operational controls before any schema change (e.g., max lock time, backfill throughput, acceptable replica lag, rollout windows).
   - **File scope:**  
     - `settings` / feature-flag config (`dual_write_user_profile`, `read_user_profile`)  
     - runbooks in `docs/` (deployment + rollback playbook)  
     - optional management command scaffolding for progress tracking
   - **Rollback:** No data change yet; disable flags and stop rollout.

2. **Add new table + minimal links, no behavior change (Expand)**
   - **What:** Create `user_profiles` table with `OneToOneField(User, primary_key=True or unique=True, db_index=True)`, nullable profile columns initially, timestamps, and any future indexes that can be created concurrently.
   - **File scope:**  
     - `app/models.py` (add `UserProfile`)  
     - `app/migrations/00xx_create_user_profiles.py` (DDL only)  
     - if needed, separate migration using `RunSQL("CREATE INDEX CONCURRENTLY ...")` (non-atomic migration)
   - **Rollback:** Safe to drop `user_profiles` table if no reads/writes depend on it yet; otherwise keep table and just stop using it.

3. **Ship application dual-write path (Expand)**
   - **What:** Keep canonical reads on `users`, but on user create/update write both: existing `users` fields and mirrored `user_profiles` fields. Make writes idempotent (`update_or_create`) and transactional where possible.
   - **File scope:**  
     - `app/models.py` / service layer (`save`, domain services)  
     - serializers/forms/admin update paths  
     - signals/tasks touching user attributes  
     - tests in `tests/` for create/update parity
   - **Rollback:** Turn off `dual_write_user_profile` flag; app reverts to `users`-only writes.

4. **Backfill 10M rows in batches (Expand)**
   - **What:** Run chunked backfill (`id` ranges or keyset pagination), using `bulk_create(..., ignore_conflicts=True)`/upserts, throttling to protect primary DB and replicas. Track high-water mark + retry dead rows.
   - **File scope:**  
     - `management/commands/backfill_user_profiles.py`  
     - optional `app/migrations/00xy_backfill_user_profiles.py` only for small metadata; avoid long data migration in Django migration for 10M
   - **Rollback:** Stop backfill job; no destructive action needed. Partial backfill is fine because dual-write keeps new/updated rows current.

5. **Verify parity and enforce completeness (Expand)**
   - **What:** Run consistency checks (counts, null checks, sampled/full hash comparisons of moved columns). When clean, enforce constraints on `user_profiles` (NOT NULL, CHECKs, FK behavior as needed).
   - **File scope:**  
     - parity audit command: `management/commands/audit_user_profile_parity.py`  
     - migration(s): `ALTER TABLE ... SET NOT NULL`, constraints/indexes
   - **Rollback:** If parity fails, keep old reads, relax newly added constraints in reverse migration, continue backfill/fixes.

6. **Shift reads to `user_profiles` behind flag (Expand -> Transition)**
   - **What:** Gradually move read paths from `users.<profile_field>` to `user.profile.<field>`, starting with low-risk callers, then all callers. Keep fallback reads from old columns temporarily.
   - **File scope:**  
     - all callers: views, serializers, GraphQL/REST DTOs, admin, reporting queries, tasks  
     - query optimization (`select_related("profile")`)  
     - tests updated for both flag states
   - **Rollback:** Flip off `read_user_profile` flag to return immediately to old read path.

7. **Freeze old columns, then stop old writes (Transition)**
   - **What:** Once reads are stable on new table, stop writing moved columns on `users` (or keep temporary sync from profile->users if you need quick rollback window). Mark old columns deprecated.
   - **File scope:**  
     - write callers/services  
     - deprecation notes in code/docs
   - **Rollback:** Re-enable old writes (or reverse sync job) and old reads via flags.

8. **Drop old columns from `users` (Contract)**
   - **What:** In a final migration window, remove migrated profile columns from `users`. Keep only identity/auth/core account fields in `users`.
   - **File scope:**  
     - `app/migrations/00xz_drop_user_profile_columns_from_users.py`  
     - cleanup model definitions and serializers
   - **Rollback:** **Not instant** after column drop. Safer pattern: delay destructive drop until after a soak period; if rollback needed pre-drop, just flip flags. If post-drop rollback is required, restore from backup/PITR or keep a shadow archival table until confidence window closes.

9. **Cleanup and hardening (Contract)**
   - **What:** Remove flags, dual-path logic, backfill/audit commands (or keep audit), dead tests, and add final indexes/constraints tuned to new access patterns.
   - **File scope:**  
     - settings/feature flags  
     - callers/services/tests  
     - docs/runbooks
   - **Rollback:** If still within soak and pre-drop snapshots retained, reintroduce flags and temporary compatibility code; otherwise forward-fix only.

---

### Expand/Contract view

- **Expand:** Steps 1-6 (additive schema, dual-write, backfill, verification, gradual read cutover)
- **Transition:** Step 7 (deprecate old path, remove old writes)
- **Contract:** Steps 8-9 (drop old columns, remove compatibility code)

---

### Key design notes for 10M rows

- Prefer **online/backfill commands** over monolithic Django data migrations.
- Use **small batches + throttling + resumable checkpoints**.
- Keep migrations with `CREATE INDEX CONCURRENTLY` in **non-atomic** migrations.
- Treat **feature flags** as primary rollback lever; treat schema rollback as secondary.
- Delay destructive drop until parity + soak period are complete.