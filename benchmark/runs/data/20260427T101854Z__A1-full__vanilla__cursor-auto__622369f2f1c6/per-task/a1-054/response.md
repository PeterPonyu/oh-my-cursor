I’ll run this as an autonomous implementation playbook with clear phase gates, including security review and bounded QA retries. I’m first pulling the relevant execution skill instructions so I can follow the required workflow format exactly.## End-to-End Autopilot Runbook (Django Password Reset by Email)

### Phase 0 — Expansion (Spec)
**Goal:** turn the request into a concrete, testable spec for Django.

- **Scope**
  - Token issuance endpoint (`POST /auth/password-reset/request`)
  - Email dispatch (reset link with signed token)
  - Reset endpoint (`POST /auth/password-reset/confirm`)
  - Token expiry + single-use behavior
  - Abuse controls (rate limit, generic responses, audit logs)
- **Deliverable**
  - `autopilot-spec.md` with API contracts, models, security constraints, and edge cases.
- **Gate criteria (must pass)**
  - Clear request/confirm API schemas and status codes
  - Explicit expiry policy (e.g., 30–60 min)
  - Explicit single-use invalidation strategy
  - Email content and link format defined
  - Threat assumptions listed (user enumeration, brute force, token theft)

---

### Phase 1 — Planning
**Goal:** produce implementation plan with task breakdown and risk controls.

- **Implementation plan includes**
  - Data model changes (if needed) or use Django token/signer primitives
  - Service layer for token generation/validation/invalidation
  - Email adapter and async sending strategy
  - Endpoint wiring, serializer/validator logic
  - Tests: unit, integration, negative-path security tests
- **Deliverable**
  - `autopilot-impl.md` with ordered tasks, owners, rollback notes.
- **Gate criteria**
  - Every requirement mapped to at least one code task + one test
  - Security controls mapped to concrete checks
  - Migration/compatibility impact assessed
  - Plan reviewed and approved by architect + critic roles

---

### Phase 2 — Execution
**Goal:** implement feature per plan (parallel where independent).

- **Workstreams**
  - **Token issuance:** create opaque/signed token, store hash/jti if needed
  - **Email send:** templated reset email, safe generic response
  - **Reset confirm:** validate token, enforce expiry/single-use, set new password
  - **Hardening:** throttle endpoints, redact sensitive logs, idempotent behavior
- **Gate criteria**
  - Endpoints implemented and wired to auth URLs
  - Expiry and single-use enforced in code
  - No plaintext token persistence
  - Email link generation works in configured environments
  - All planned tests authored

---

### Phase 3 — QA (Bounded Retry Budget)
**Goal:** reach green build/lint/tests with controlled retry loop.

- **Cycle steps**
  1. Run lint/static checks
  2. Run unit/integration tests
  3. Fix failures
  4. Re-run
- **Budget**
  - **Max QA cycles:** 5
  - **Early stop rule:** if same root error repeats **3 times**, stop as fundamental issue
- **Gate criteria**
  - Fresh green test run output
  - No failing lint/type checks
  - Critical flows manually smoke-tested:
    - request reset for existing/non-existing email (same outward response)
    - expired token rejected
    - reused token rejected
    - successful reset allows login with new password

---

### Phase 4 — Mandatory Review (Security Review Required)
**Goal:** parallel validation by three reviewers; all must approve.

- **Required reviewers**
  - **Architect reviewer:** functional completeness
  - **Security reviewer (mandatory):** token/email/reset threat posture
  - **Code reviewer:** quality, maintainability, regressions
- **Re-validation loop**
  - Apply fixes for rejections, then rerun all 3 reviewers
- **Budget**
  - **Max re-validation rounds:** 3
- **Gate criteria**
  - All 3 reviewers approve in the same round
  - Security review explicitly signs off on:
    - anti-enumeration responses
    - expiry/single-use token semantics
    - secure token handling/storage
    - abuse controls/rate limiting
    - password policy enforcement

---

### Phase 5 — Cleanup
**Goal:** finalize, document, and clear orchestration state.

- **Actions**
  - Remove temporary diagnostics
  - Ensure docs/changelog updated
  - Confirm no debug settings leak
  - Clear automation mode state
- **Gate criteria**
  - Working tree contains only intended changes
  - Final run summary captured
  - Operational notes included (env vars, email backend, TTL config)

---

## Rejection Handling Policy (After Retry Budget Exhausted)

If review keeps rejecting after the max re-validation rounds:

- **Stop auto-fix loop immediately** (no infinite churn).
- Publish a **blocking report** with:
  - unresolved findings grouped by severity
  - attempted fixes and why insufficient
  - exact files/components impacted
  - decision options (tighten spec, accept risk, redesign approach)
- Mark status as **`needs-human-decision`**.
- Escalate to owner for one of:
  - requirement clarification,
  - architecture change approval,
  - explicit risk acceptance.
- Resume only after a new directive; start from Planning or Execution depending on scope change.

---

## Minimal Security Baseline for This Django Feature

- Generic response on reset request to prevent account enumeration
- Strong, time-limited token (signed/hashed), single-use invalidation
- Rate limiting on request + confirm endpoints
- Password validation via Django validators
- Audit/security logging without secrets
- HTTPS reset links only, trusted domain allowlist

If you want, I can turn this into a concrete task checklist against your current Django project structure next.