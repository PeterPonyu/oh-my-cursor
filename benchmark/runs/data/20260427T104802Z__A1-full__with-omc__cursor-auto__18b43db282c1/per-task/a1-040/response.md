## CI-to-Green Loop Spec

**Purpose:** deterministically turn a known set of failing CI checks into passing checks using only fresh, observable evidence.

### Inputs
- `failing_checks`: list of failing check identifiers (name + job URL/run ID + commit SHA)
- `target_sha`: commit SHA to fix (or PR head SHA)
- `max_iter`: hard cap (default `8`, configurable `1..20`)

### Per-Iteration Step
1. **Snapshot state (fresh):**
   - Query CI provider for current status of every check in `failing_checks` at current `target_sha`.
   - Build `active_failures` from checks still failing.
2. **Select one actionable failure:**
   - Pick highest-priority failure (e.g., deterministic/lint/test before flaky/infra).
   - Record exact failing evidence (log excerpt, stack trace, test name, artifact link).
3. **Apply minimal fix:**
   - Make smallest change addressing that specific failure mode.
   - Keep change idempotent and scoped.
4. **Local validation (where possible):**
   - Run the closest equivalent local command for that check.
   - If local reproduction is impossible, document why and proceed directly to CI rerun.
5. **Push/rerun and wait:**
   - Update branch/commit as needed and trigger CI.
   - Wait for completion of affected checks.
6. **Re-evaluate from source of truth:**
   - Re-query CI statuses for all original checks (plus newly affected ones, if any).
   - Persist iteration record: attempted fix, commands, CI run URLs, pass/fail delta.

### Fresh Evidence Requirement (mandatory)
- A check is considered fixed **only** if CI reports `success` for that check on a run started **after** the fix commit.
- Acceptable evidence: check API status, run URL, run timestamp, commit SHA match.
- Stale results (older run, different SHA) are invalid.

### Idempotence Rules
- Re-running an iteration without new code changes must not produce duplicate side effects beyond a new CI run record.
- Each iteration must:
   - avoid broad refactors unrelated to active failure,
   - avoid mutating historical evidence,
   - keep deterministic selection and logging format.
- If no new actionable evidence appears, iteration outcome is `no-op` and counts toward cap.

### Max-Iteration Cap
- Stop after `max_iter` iterations even if not green.
- On cap hit, emit final failure report with:
  - unresolved checks,
  - attempted fixes,
  - last observed evidence per check,
  - recommended escalation owner.

### Stop Conditions
- **Success stop:** all checks in current required-check set are `success` for latest `target_sha`.
- **Fundamental-failure stop (early terminate):**
  - missing credentials/secrets or permission denial,
  - CI infrastructure outage/quota exhaustion,
  - non-reproducible flaky behavior beyond retry budget,
  - required dependency/service unavailable,
  - policy gate cannot be satisfied by code changes in scope.
- Fundamental failure must include explicit evidence (error codes, provider incident link, auth error logs).

### Observable Success Signal
- Single machine-verifiable signal:
  - `ci_required_checks_passed=true`
  - with payload: `{sha, timestamp, required_checks:[...], run_urls:[...]}`
- Human-readable confirmation:
  - “All required checks are green on `<sha>` with linked CI runs.”

### Hard Prohibition
- **Never mark checks green by inference.**
- Disallowed examples:
  - “It passed locally so CI is probably fine.”
  - “A similar check passed, so this one should be green.”
  - “No new failures appeared, so previous failures are assumed fixed.”
- Only explicit CI success status on the correct SHA satisfies completion.