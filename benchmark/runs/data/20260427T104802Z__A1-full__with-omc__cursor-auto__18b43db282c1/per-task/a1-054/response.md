## End-to-End Auto-Execution Runbook: Django Password Reset by Email

Use this as an execution contract for an agent loop. Each phase has hard gate criteria; no phase advances unless all gates pass.

### Phase 0: Expansion (Scope Lock)
- **Goal:** Turn the request into explicit, testable requirements for existing Django auth.
- **Work:**
  - Identify current auth stack (`django.contrib.auth` vs custom user model, DRF vs Django views, existing mail backend).
  - Define reset flow: request-reset -> issue token -> send email -> submit new password with token -> invalidate token.
  - Define token policy: single-use, signed/random, hashed-at-rest, expiry window, attempt limits.
  - Define API contracts and error semantics (non-enumerating responses for reset request).
- **Gate criteria (must all pass):**
  - Exact endpoint list and payload/response schemas documented.
  - Token storage + expiry + invalidation model documented.
  - Threat assumptions documented (user enumeration, token theft, replay, brute force).
  - Backward-compatibility impact assessed.

---

### Phase 1: Planning (Implementation Blueprint)
- **Goal:** Produce a concrete build/test/review plan before edits.
- **Work:**
  - Create task list by layer: model, service, email template, API/view, serializer/form, URL wiring, tests, docs.
  - Define migration needs (new reset-token table/fields, indexes on `user_id`, `expires_at`).
  - Define observability/logging (security events only, no token leakage).
  - Define rollout flags (if needed) and failure handling.
- **Gate criteria:**
  - Every requirement from Phase 0 maps to at least one implementation task.
  - Test matrix exists (unit + integration + security abuse cases).
  - Rollback strategy exists (migration + feature disable path).
  - Reviewer checklist drafted.

---

### Phase 2: Execution (Code + Migrations + Docs)
- **Goal:** Implement password reset flow safely.
- **Work:**
  - **Token issuance:** cryptographically strong token; persist only hash; include `expires_at`; mark unused/used.
  - **Email send:** send reset link with HTTPS URL and opaque token; template avoids sensitive data.
  - **Reset endpoint:** validate token hash + expiry + unused state; enforce password validators; rotate/invalidate token on success.
  - **Expiry enforcement:** reject expired tokens; optional periodic cleanup command.
  - **Anti-enumeration:** reset-request response is uniform whether email exists or not.
  - **Rate limits:** by IP and account/email key (app-level throttle or gateway).
  - **Docs:** endpoint docs, expiry policy, admin/runbook notes.
- **Gate criteria:**
  - Migrations apply cleanly up/down in dev.
  - No plaintext token persisted or logged.
  - Token is single-use and cannot be replayed.
  - Reset request does not reveal account existence.
  - All new tests compile and run locally.

---

### Phase 3: QA (Bounded Retry Loop)
- **Goal:** Prove behavior and regression safety with capped retries.
- **Retry budget:** **max 3 full QA cycles** (Cycle = run suite, triage failures, fix, rerun).
- **Required QA set each cycle:**
  - Happy path: request-reset -> receive email -> reset succeeds.
  - Invalid token, expired token, reused token.
  - Password policy failure.
  - Enumeration resistance checks on request endpoint.
  - Rate-limit behavior.
  - Regression tests for login/session flows.
- **Gate criteria to pass QA:**
  - 100% pass on required QA set.
  - No critical/high severity defects open.
  - No flaky test unresolved in changed area.
- **If budget exhausted (3 cycles, still failing):**
  - Freeze feature branch for escalation.
  - Produce defect dossier: failing tests, root-cause hypotheses, repro steps, risk impact.
  - Hand off for architectural/security decision (do **not** bypass gates).

---

### Phase 4: Mandatory Security-Review Pass (Cannot Skip)
- **Goal:** Independent security validation before merge.
- **Review checklist (minimum):**
  - Token entropy and generation method acceptable.
  - Token hashing strategy and compare function are safe.
  - Expiry window and clock-skew handling defined.
  - Replay prevention verified (single-use, transactional consume).
  - No user enumeration in responses/timing-sensitive paths.
  - No token leakage in logs, traces, analytics, exceptions.
  - Email link construction safe (trusted host, HTTPS, no open redirect).
  - Brute-force/rate-limit controls effective.
- **Gate criteria:**
  - Security reviewer marks **PASS** with no unresolved critical/high items.
  - Any medium findings have explicit remediation or accepted risk sign-off.

---

### Phase 5: Review (Code Review + Product Acceptance)
- **Goal:** Merge-readiness by maintainers.
- **Work:**
  - Address reviewer comments with tests/docs updates.
  - Re-run targeted QA after each non-trivial change.
- **Gate criteria:**
  - Required approvers approved.
  - CI green.
  - Security pass still valid after latest changes (or rerun if needed).

---

### Phase 6: Cleanup (Operational Hardening)
- **Goal:** Leave system maintainable and safe post-merge.
- **Work:**
  - Remove debug artifacts/test knobs.
  - Ensure management command/scheduled cleanup for expired tokens.
  - Update runbook: support scripts, incident response, common failure modes.
  - Confirm monitoring alerts for abnormal reset volume/failures.
- **Gate criteria:**
  - No temporary code left.
  - Docs/runbook updated.
  - Monitoring hooks verified.

---

## Rejection Handling Policy (After QA Budget Exhausted)

If review keeps rejecting and QA retry budget is exhausted:
- Stop iterative patching on same branch.
- Open a formal escalation packet containing:
  - unresolved findings,
  - attempted fixes and why they failed,
  - risk of shipping vs not shipping,
  - recommended redesign options (e.g., switch to Django’s built-in reset flow with custom adapters).
- Require decision from tech lead + security owner:
  - **Option A:** redesign scope and restart from Phase 0;
  - **Option B:** de-scope feature and ship without reset;
  - **Option C:** adopt vetted framework-native implementation to reduce custom attack surface.
- No merge until a fresh pass through QA + Security Review gates completes.

---

## Suggested Default Parameters
- Token TTL: `15-60 minutes` (commonly `30m`).
- QA retry budget: `3` cycles.
- Rate limit baseline: e.g. `5 reset requests / 15 min / IP` and `3 / 15 min / account key`.
- Security review severity policy: block on `critical/high`; explicit sign-off for `medium`.

If you want, I can turn this into a repo-ready checklist template (`docs/password-reset-rollout.md`) plus a PR checklist section your team can use directly.