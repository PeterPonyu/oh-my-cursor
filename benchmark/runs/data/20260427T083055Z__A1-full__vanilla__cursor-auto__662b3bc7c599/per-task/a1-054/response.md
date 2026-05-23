## End-to-End Auto-Execution Runbook (Django Password Reset by Email)

Below is a **production-style phased run** you can execute for an existing Django auth system.  
Feature scope: **token issuance, email delivery, reset endpoint, token expiry**.

---

## Phase 0: Expansion (Requirements Hardening)

**Goal:** turn the request into executable, testable acceptance criteria.

### Tasks
- Confirm current auth stack (`django.contrib.auth`, custom user model, DRF/non-DRF).
- Define API contracts:
  - `POST /auth/password-reset/request` (email input, always generic success response).
  - `POST /auth/password-reset/confirm` (token + new password).
- Define token model/strategy:
  - Random high-entropy token (>=32 bytes), store **hash only**, single-use.
- Define expiry policy:
  - e.g. `expires_at = issued_at + 30 minutes`.
- Define abuse controls:
  - per-IP + per-identifier rate limiting, logging, optional CAPTCHA threshold.
- Define email template requirements and sender identity.
- Define observability/audit fields (requested_at, consumed_at, ip/user-agent optional).

### Gate Criteria (must pass)
- Endpoint contracts documented.
- Token lifecycle documented (issue, validate, consume, expire, revoke).
- Security constraints explicitly documented:
  - no user enumeration,
  - hashed tokens at rest,
  - single-use + expiry,
  - rate limiting.
- Test matrix drafted (unit + integration + abuse/security tests).

---

## Phase 1: Planning (Design + Task Breakdown)

**Goal:** produce implementation plan with dependencies and rollback path.

### Tasks
- Data model plan:
  - `PasswordResetToken(user, token_hash, expires_at, consumed_at, created_at, request_ip, ua)`.
- Service-layer plan:
  - `issue_reset_token(email)`
  - `send_password_reset_email(user, raw_token)`
  - `reset_password(raw_token, new_password)`
- Endpoint plan:
  - request endpoint returns same response for known/unknown emails.
  - confirm endpoint validates token + expiry + consumed state, sets password, invalidates sessions if required.
- Config plan:
  - expiry minutes, frontend reset URL base, email backend settings.
- Migration + backward compatibility plan.
- QA plan with bounded retry budget (defined in Phase 4).

### Gate Criteria
- Implementation tasks decomposed by file/module.
- Threats mapped to controls (enumeration, replay, brute force, leakage).
- Rollback plan defined (feature flag or safe disable path).
- Plan approved for execution.

---

## Phase 2: Execution (Implementation)

**Goal:** ship complete feature in code.

### Tasks
1. **Model + migration**
   - Add password reset token persistence with indexed lookup fields.
2. **Token issuance**
   - Generate secure token (`secrets.token_urlsafe`/equivalent).
   - Store only hashed token (e.g. SHA-256 with app-level pepper if desired).
3. **Email flow**
   - Build reset URL containing raw token.
   - Send asynchronous email if queue exists; fallback sync with robust error handling.
4. **Reset confirmation**
   - Validate token hash match.
   - Check not expired and not consumed.
   - Enforce password policy validators.
   - Set new password, mark token consumed, invalidate other active reset tokens for that user.
5. **Hardening**
   - Uniform responses for request endpoint.
   - Rate limiting on both request and confirm endpoints.
   - Structured security/audit logs without sensitive token leakage.
6. **Docs/config**
   - Add env vars + operational docs.

### Gate Criteria
- Migrations apply cleanly.
- Happy path works end-to-end.
- Invalid/expired/consumed token paths handled correctly.
- No raw token persisted or logged.
- Lint/tests pass locally before QA phase entry.

---

## Phase 3: Mandatory Security-Review Pass (Required, no bypass)

**Goal:** formal security sign-off before release.

### Checklist (must all pass)
- **Enumeration resistance:** request endpoint response/time profile does not reveal account existence.
- **Token security:** high entropy, hashed at rest, single-use enforced, short TTL.
- **Replay resistance:** consumed token cannot be reused.
- **Brute-force controls:** rate limiting + optional temporary lockouts.
- **Transport/security headers:** HTTPS-only deployment assumptions validated.
- **Secrets hygiene:** token never in logs, traces, analytics events, or error messages.
- **Session posture:** password reset revokes/rotates sessions/tokens as policy dictates.
- **Email safety:** no sensitive PII beyond required context; links point to trusted domain.

### Gate Criteria
- Security review status = **PASS** (explicit).
- Any HIGH/CRITICAL findings = zero.
- MED findings have approved mitigation or remediation completed.

---

## Phase 4: QA (Bounded Retry Budget)

**Goal:** validate behavior and stability with limited fix loops.

### QA Scope
- Unit tests: token issue/validate/expire/consume.
- Integration tests: request + confirm endpoints + email backend behavior.
- Abuse tests: rate-limit triggers, repeated token use, malformed payloads.
- Regression tests: existing auth/login unaffected.

### Retry Budget (explicit)
- **Max 3 QA cycles** total (`initial + up to 2 retries`), or pick your org default.
- Each failed cycle must produce:
  - defect list,
  - root cause,
  - targeted fix,
  - re-run impacted suite + smoke full suite.

### Gate Criteria
- All P0/P1 defects closed.
- Full required test suite green.
- Retry counter not exceeded.

---

## Phase 5: Review (Code Review + Release Readiness)

**Goal:** reviewer acceptance for merge/release.

### Tasks
- Submit PR with:
  - architecture summary,
  - security notes,
  - test evidence,
  - migration/rollback notes.
- Address review comments in batches; keep commit history clean and traceable.
- Re-run CI after each significant change.

### Gate Criteria
- Reviewer state = **Approved**.
- CI = green.
- Security pass still valid after latest diff.

---

## Phase 6: Cleanup + Operationalization

**Goal:** finalize for maintainability and operations.

### Tasks
- Remove dead code/feature flags (if temporary).
- Finalize docs (API contract, runbook, on-call notes).
- Add dashboards/alerts:
  - reset request volume spikes,
  - email failures,
  - suspicious token failures.
- Post-release validation in production logs/metrics.

### Gate Criteria
- Documentation updated.
- Monitoring/alerts active.
- No unresolved release blockers.

---

## If Review Keeps Rejecting After QA Retry Budget Is Exhausted

Use a strict escalation path (don’t loop indefinitely):

1. **Stop feature churn** and mark status: `BLOCKED_AFTER_QA_BUDGET`.
2. **Open escalation review** with security + tech lead + reviewer:
   - unresolved findings,
   - attempted fixes,
   - risk assessment.
3. Decide one of three bounded outcomes:
   - **A. De-scope** to minimal safe subset (e.g., disable endpoint variant, keep core flow).
   - **B. Feature flag OFF** and merge non-risky scaffolding only.
   - **C. Abort release** and create follow-up remediation epic with owner + deadline.
4. Require explicit sign-off for whichever outcome is chosen.
5. Capture lessons learned and update checklist to prevent repeat rejection loops.

---

## Minimal “Definition of Done” for This Feature

- Password reset request and confirm endpoints implemented.
- Email reset flow functional.
- Token is secure, hashed, single-use, and expires.
- Mandatory security review passed.
- QA passed within retry budget.
- PR approved, CI green, monitoring and docs complete.