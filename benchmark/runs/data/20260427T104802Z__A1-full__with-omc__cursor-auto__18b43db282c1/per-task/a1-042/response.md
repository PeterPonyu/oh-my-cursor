## Error-Burn-Down Loop (312 -> 0)

Use a **clustered, story-driven iteration loop** instead of “fix all errors” batches.

### 1) PRD Shape (per cluster, not per repo)

Create a mini-PRD for each error cluster:

- **Story ID + Cluster Name**: e.g. `TS-017: API DTO nullability mismatch`
- **Scope**: exact files/modules touched
- **Error Signature**: exact TS codes + representative messages (e.g. `TS2322`, `TS2345`)
- **Root Cause Hypothesis**: why this cluster exists
- **Fix Strategy**: intended code transformation pattern
- **Task-Specific Acceptance Criteria** (must be concrete):
  - “All `UserDto.birthDate` assignments in `src/api/*` use `Date | null`, no `undefined`”
  - “`mapOrderToViewModel()` returns `OrderViewModel` without `as any`”
  - “No remaining `TS2345` in `src/services/order/**` caused by `ReadonlyArray` vs mutable array”
- **Out-of-Scope Guardrails**: what this story must not change
- **Regression Risks + Checks**: tests/build surfaces affected

---

### 2) Iteration Unit (single loop cycle)

For each iteration `i` (1..maxIter):

1. **Re-snapshot diagnostics fresh**  
   Run full `tsc --noEmit` (or project refs equivalent) and persist results with timestamp.
2. **Re-cluster remaining errors**  
   Cluster by `(TS code + module + root-cause pattern)`.
3. **Pick next story**  
   Prioritize by: blocking depth, fan-out, and risk.
4. **Execute cluster fix**  
   Apply only scoped transformations tied to that story.
5. **Fresh verification (required every iteration)**  
   - Re-run `tsc --noEmit` from clean state.
   - Recompute error delta: fixed/new/moved.
   - Run story-specific checks/tests from PRD.
6. **Reviewer pass (separate from fixer)**  
   A different reviewer validates:
   - acceptance criteria truly satisfied,
   - no criterion was met via unsafe bypass (`any`, blanket casts, disabled checks),
   - no net-new unrelated error class introduced.
7. **Commit iteration artifact**  
   Store: before/after counts, remaining clusters, reviewer verdict.

---

### 3) Idempotence Under Partial Fixes

Design loop state so reruns are safe if interrupted:

- **State file** per iteration (`iteration-log.json`):
  - diagnostic snapshot hash,
  - chosen story ID,
  - files touched,
  - criteria status,
  - reviewer status.
- **Replay-safe selection rule**:
  - If previous story incomplete, resume same story only if current diagnostics still match its signature.
  - If signature changed, mark story “stale”, re-cluster, and generate updated story ID.
- **No destructive assumptions**:
  - Never assume previous fixes held; always verify from fresh diagnostics.
  - Acceptance is based on current compiler output + current code, not prior iteration status.

---

### 4) Stop Conditions

#### Success stop
Declare done only when all are true:

- `tsc --noEmit` returns 0 errors on fresh run.
- No open stories remain.
- Final independent reviewer pass is green.
- Optional: smoke test/build checks pass.

#### Fundamental-issue stop
Stop early (with explicit escalation report) if any holds for `k` consecutive iterations (e.g. 3):

- Error count does not decrease and root cause is architectural (type boundary mismatch requiring schema redesign).
- Fixing one cluster deterministically reintroduces another (cyclic type contract conflict).
- Required external constraints prevent compliant fix (generated types/source-of-truth conflict).
- Compiler/runtime/tooling bug suspected and reproducible.

Escalation output should include: blocking clusters, proof, and redesign proposal.

---

### 5) Max-Iteration Cap

Set `maxIter` (example: 40).  
At `i == maxIter` and errors > 0:

- auto-stop with “cap reached” status,
- emit ranked remaining clusters with estimated effort/risk,
- require human decision: increase cap, reduce scope, or redesign.

---

### 6) Practical Acceptance Criteria Template (task-specific)

For each story, enforce criteria in 3 layers:

- **Compiler criterion**: exact error signatures eliminated in exact scope.
- **Code-shape criterion**: required typing pattern present (not bypassed).
- **Behavior criterion**: relevant unit/integration checks pass.

Example:

- Compiler: “0 `TS2322` in `src/domain/payment/**` involving `Money` -> `number` assignment.”
- Code-shape: “`Money` conversions only via `toMinorUnits()` helper; no inline casts.”
- Behavior: “`payment-rounding.spec.ts` all pass.”

---

## Minimal Loop Pseudocode

```ts
for (let i = 1; i <= maxIter; i++) {
  const snap = runTscSnapshot();                 // fresh every time
  if (snap.errorCount === 0) return successAfterReviewer();

  const clusters = clusterErrors(snap.errors);
  const story = selectNextStory(clusters, state);

  applyScopedFix(story);
  const verify = runTscSnapshot();               // fresh verification
  const criteria = evaluateStoryCriteria(story, verify, codebaseChecks());

  const review = independentReviewerPass(story, criteria, verify);
  persistIterationState(i, snap, story, verify, criteria, review);

  if (shouldStopFundamental(state)) return fundamentalStopReport(state);
}
return capReachedReport(state);
```

---

If you want, I can turn this into a **copy-paste operational checklist** (roles, artifacts, and exact per-iteration command contract) tailored to your repo layout and CI.