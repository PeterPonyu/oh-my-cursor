1. **Define target schema and compatibility contract (pre-work)**
   - **What:** Keep `users` as auth/identity core; create `user_profiles` for profile/optional fields, `OneToOne` with `users` (`user_id` PK/FK or unique FK), nullable fields initially if needed.
   - **Expand/Contract:** **Pre-Expand design**
   - **File scope:** `models.py` (both app models), architecture doc/runbook, any serializers/forms/admin touching moved fields.
   - **Rollback:** No DB change yet; safe to abort or revise design.

2. **Inventory and classify columns to move**
   - **What:** Tag each `users` column as: stays, moves to profile, computed/derived, deprecated. Identify read/write paths (ORM, raw SQL, ETL, admin, tasks, APIs).
   - **Expand/Contract:** **Pre-Expand analysis**
   - **File scope:** callers across views/services/tasks/signals/management commands, reporting SQL, data exports.
   - **Rollback:** No schema mutation; revert analysis artifacts only.

3. **Add new `user_profiles` table with non-breaking constraints**
   - **What:** Create migration for `user_profiles` with `user = OneToOneField(User, on_delete=CASCADE, db_index=True)`; add moved columns there; avoid immediate `NOT NULL`/strict checks that block backfill.
   - **Expand/Contract:** **Expand**
   - **File scope:** Django migration file, `models.py`, optional `admin.py`.
   - **Rollback:** Drop new table in reverse migration (safe if not yet used); if partially used, keep table but disable feature flags first.

4. **Introduce dual-read in app layer (prefer profile, fallback users)**
   - **What:** Add compatibility accessors so reads work whether data lives in old or new location. Example: service/repository layer or model properties reading profile field then old `users` field fallback.
   - **Expand/Contract:** **Expand**
   - **File scope:** model methods/properties, service layer, serializers, API response builders, templates.
   - **Rollback:** Revert code to old reads only; DB untouched.

5. **Introduce dual-write (write both old and new columns)**
   - **What:** On create/update, write to `user_profiles` and legacy `users` columns. Make operation idempotent and transactional where possible. For high write throughput, prefer app-level dual-write over triggers unless needed.
   - **Expand/Contract:** **Expand**
   - **File scope:** write callers (signup, profile update, admin edits, background jobs), model `save()` hooks/signals carefully if used.
   - **Rollback:** Disable dual-write via feature flag; continue writing legacy only. New table can remain.

6. **Deploy expand code before backfill**
   - **What:** Release schema + dual-read/write code first so new writes keep both stores in sync while old rows are backfilled.
   - **Expand/Contract:** **Expand**
   - **File scope:** deploy config, feature flags, release notes/runbook.
   - **Rollback:** Roll back app release; schema additive so safe to leave in place.

7. **Backfill `user_profiles` in chunks (10M rows)**
   - **What:** Run batched backfill (management command or offline worker): iterate by PK ranges, `INSERT ... SELECT`/`bulk_create` with conflict handling, checkpoint progress, throttling, retries, and metrics.
   - **Expand/Contract:** **Expand**
   - **File scope:** management command / data migration script, observability dashboards/alerts.
   - **Rollback:** Stop job safely; rerunnable from checkpoint. No destructive action required.

8. **Add consistency verification and repair loop**
   - **What:** Validate counts and row-level parity (sampled + full aggregate checks): missing profile rows, mismatched values, drift after dual-write. Auto-repair missing/mismatched rows in batches.
   - **Expand/Contract:** **Expand**
   - **File scope:** verification script/command, runbook docs, monitoring/alerts.
   - **Rollback:** If drift is high, keep dual-write, fix data, postpone contract.

9. **Switch reads to `user_profiles` only (keep dual-write temporarily)**
   - **What:** Flip read flag so application no longer depends on old `users` columns at runtime; keep writing both for one stabilization window.
   - **Expand/Contract:** **Expand (late)**
   - **File scope:** feature-flagged read paths in callers, serializers, APIs.
   - **Rollback:** Re-enable fallback/legacy reads instantly via flag.

10. **Harden constraints on `user_profiles` after data is complete**
    - **What:** Add `NOT NULL`, stricter checks, indexes (possibly concurrent where applicable), uniqueness guarantees needed for production behavior.
    - **Expand/Contract:** **Transition to Contract readiness**
    - **File scope:** Django migration(s) + possible custom SQL migration for concurrent index operations.
    - **Rollback:** Drop/relax new constraints if issues appear; keep old columns intact until stable.

11. **Stop legacy writes (write new table only)**
    - **What:** Remove legacy-column writes once verification passes over a full business cycle.
    - **Expand/Contract:** **Contract**
    - **File scope:** all write callers, service layer, signals/hooks.
    - **Rollback:** Re-enable dual-write quickly (keep compatibility code until final drop).

12. **Drop/retire moved columns from `users`**
    - **What:** Final contract migration to remove moved columns from `users`; keep only identity/auth fields there.
    - **Expand/Contract:** **Contract**
    - **File scope:** Django migration, `models.py`, raw SQL/reporting queries.
    - **Rollback:** Hardest rollback point. Prefer delayed irreversible drop (soft-deprecate first, or retain columns for one release cycle). If already dropped, restore from backup/PITR + replay strategy.

13. **Remove compatibility code and finalize callers**
    - **What:** Delete fallback properties, feature flags, dead paths; simplify APIs to source profile fields from `user_profiles` only.
    - **Expand/Contract:** **Contract (cleanup)**
    - **File scope:** models/services/serializers/forms/admin/tasks/tests/docs.
    - **Rollback:** Can reintroduce compatibility code in a hotfix if columns still exist; otherwise requires rollback DB restore plan.

14. **Post-migration guardrails**
    - **What:** Add tests and checks to prevent regressions (no caller references removed `users` columns), plus migration runbook closeout.
    - **Expand/Contract:** **Post-Contract**
    - **File scope:** unit/integration tests, linters/checks, developer docs.
    - **Rollback:** Not typically needed; revert guardrail commits if noisy.

---

### Recommended expand/contract release slicing (practical for 10M rows)
- **Release A (Expand-1):** add table + dual-read/write scaffolding off by default.
- **Release B (Expand-2):** enable dual-write, run backfill + verification.
- **Release C (Expand-3):** switch reads to new table, monitor drift.
- **Release D (Contract-1):** stop legacy writes, enforce strict constraints.
- **Release E (Contract-2):** drop legacy columns + remove compatibility code.

---

### Key risk controls for 10M-row Postgres migration
- Use **chunked backfill** with checkpoints; avoid single giant transactions.
- Prefer **online/index-concurrent** operations where needed.
- Keep **feature flags** for read path and write mode (legacy/dual/new).
- Define explicit **go/no-go metrics** (parity %, error rates, p95 latency).
- Keep a **PITR rollback window** through at least one full cycle after contract start.