## CI-to-Green Loop Spec

### Contract
- **Input:** `failing_checks[]` (each with check name, URL/log source, commit SHA).
- **Output:** Updated commit(s) such that all required checks are actually passing on the target SHA.
- **Hard rule:** **Never mark a check green by inference.** A check is green only with fresh, direct evidence from that check run.

### Per-Iteration Step (single loop body)
1. **Snapshot current state**
   - Pull current failing checks for the latest target SHA.
   - Record run IDs/timestamps/statuses as baseline.
2. **Select one actionable failure**
   - Pick the highest-priority failing check (deterministic order: required > blocking > oldest failing).
3. **Collect fresh failure evidence**
   - Fetch logs/artifacts for that exact check run on current SHA.
   - Extract concrete failure signature (test name, stack trace, lint rule, build step, etc.).
4. **Apply minimal fix**
   - Make the smallest change that addresses the observed signature.
   - Keep unrelated code untouched.
5. **Validate locally (if reproducible)**
   - Run corresponding local command(s) for the failing scope.
   - If local repro unavailable, proceed with CI-triggering change only.
6. **Push/trigger CI**
   - Create new SHA (or rerun when appropriate) and wait for new check runs.
7. **Re-evaluate all required checks**
   - Replace prior status with **new run evidence** only.
   - Update `failing_checks[]` from latest CI state.

---

### Fresh Evidence Requirement (mandatory)
A check status update is valid only if all are true:
- Evidence comes from a **new run** tied to the **current SHA** (or explicit rerun ID on same SHA).
- Status source is authoritative CI API/UI status for that check.
- Evidence timestamp/run ID is newer than prior loop iteration.
- Logs/artifacts are available for any still-failing check.

If any of these are missing, status is **unknown**, not green.

---

### Idempotence Requirements
- Re-running the loop with unchanged inputs produces no duplicate side effects beyond re-reading status.
- Fix application must be deterministic:
  - Same failure signature -> same remediation path.
  - No repeated commits for identical code/content.
- State tracking keys: `(repo, branch, sha, check_name, run_id)`.
- If no new evidence appears, loop does not “advance” status.

---

### Max-Iteration Cap
- `MAX_ITER = 10` (default; configurable).
- Also enforce `MAX_NO_PROGRESS = 2` consecutive iterations with no reduction in failing required checks.

---

### Stop Conditions

#### Success stop
Stop when:
- All **required** checks on latest target SHA are `success`, and
- No required check is `pending/running/unknown`.

#### Fundamental-failure stop
Stop early and classify as fundamental failure if any holds:
- Same failure signature persists for `K=3` iterations despite targeted fixes.
- Failure is external/non-actionable by code change (CI outage, missing secret, quota, infra dependency, permission error).
- Reproduction impossible with missing required context/artifacts.
- Max iteration cap or no-progress cap reached.

On fundamental failure, output:
- failing checks with latest run IDs,
- attempted fixes,
- blocking root cause class,
- explicit handoff action needed.

---

### Observable Success Signal
A single machine-checkable condition:
- CI query for latest target SHA shows:
  - `required_checks_all_success == true`
  - `required_checks_any_nonterminal == false`
- Optionally confirmed by merge gate/API readiness (e.g., branch protection reports mergeable).

---

## Explicit Non-Inference Policy
- Do **not** mark green because:
  - “similar failure passed elsewhere,”
  - “local tests passed,”
  - “flake is likely resolved,”
  - “no new failures appeared.”
- Only direct CI status evidence for the exact check/run/SHA can set green.