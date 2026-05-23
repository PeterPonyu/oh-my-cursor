## Multi-Story PRD Iteration Loop

Use this as a deterministic control loop over stories `S1..Sn` with per-story acceptance criteria.

### 1) Loop Structure (Story-by-Story)

For each story `Si` in PRD order:

1. **Load Story Contract**
   - Inputs: story scope, constraints, and **task-specific acceptance criteria** (`ACi`).
   - Freeze these for the current iteration unless a formal PRD change is approved.

2. **Implement Story**
   - Execute only `Si` scope.
   - Produce traceable artifacts (code, tests, docs, migration notes as required by `ACi`).

3. **Fresh Verification (Required Every Iteration)**
   - Run verification from a clean state for `Si` (not reused prior logs).
   - Execute:
     - unit/integration tests tied to `ACi`
     - lint/static/type/security checks required by PRD
     - runtime or UX checks required by `ACi`
   - Record machine-readable result bundle `Vi(k)` for iteration `k`.

4. **Reviewer Pass (Separate Gate)**
   - A reviewer distinct from implementer evaluates:
     - `ACi` coverage
     - regression risk to prior completed stories
     - code quality/security/compliance notes
   - Output: `PASS` or `FAIL` with actionable findings.

5. **Decision**
   - If verification `PASS` and reviewer `PASS` → mark story `Done`.
   - Else → create next iteration for `Si` with failure deltas only; repeat steps 2–5.

After `Si` is `Done`, proceed to `Si+1`.

---

## Required Control Outputs

### Stop Condition
Declare **whole PRD done** only when all are true:

- Every story `Si` is `Done`.
- Latest verification bundle for each story is `PASS`.
- Latest separate reviewer pass for each story is `PASS`.
- No open blocker/critical findings linked to any story acceptance criterion.
- PRD-level integration/regression suite (across stories) is `PASS`.

Formally:  
`DONE_PRD := ∀i (Verify_i=PASS ∧ Review_i=PASS ∧ AC_i_satisfied) ∧ GlobalRegression=PASS ∧ OpenCriticalFindings=0`

---

### Max-Iteration Cap
Set both per-story and global caps:

- **Per story cap:** `K_story = 5` iterations (default)
- **Global cap:** `K_total = 3 * n + 5` (where `n` = number of stories)

If either cap is hit:
- halt normal loop,
- escalate with a “blocked PRD” report (root cause, unresolved criteria, decision needed),
- do **not** declare done.

---

### Idempotence Guarantee for Re-runs
Guarantee re-runs are safe and non-duplicative via:

- **Stable story IDs and acceptance criteria hashes** (e.g., `story_id + ac_hash`).
- **Deterministic step order** (implement → fresh verify → reviewer).
- **Artifact versioning by (`story_id`, `iteration`)** with overwrite-safe semantics.
- **No side-effect replay without guards** (migrations/seeding must be idempotent; use upserts/checkpoints).
- **Status transitions monotonic**: `NotStarted -> InProgress -> Done`; only explicit reviewer/verification failure can reopen.
- **Re-run rule**: if inputs unchanged and latest `Verify=PASS` + `Review=PASS`, loop skips implementation and returns same `Done` state.

---

### Observable Success Signal (Final Gate)
Use one explicit, externally visible signal:

**`PRD_COMPLETION_CERTIFICATE`** generated only when stop condition is met, containing:
- story-by-story matrix: `StoryID | AC Hash | Verify Result | Reviewer Result | Timestamp`
- global regression pass ID
- zero-open-critical-findings count
- immutable run ID

Only this certificate authorizes declaring the full PRD complete.

---

If you want, I can also provide this as executable pseudocode/state-machine form (`YAML` + transition rules) for direct automation.