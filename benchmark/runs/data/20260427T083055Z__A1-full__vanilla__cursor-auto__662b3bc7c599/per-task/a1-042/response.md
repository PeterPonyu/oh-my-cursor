## Error-Burn-Down Loop (312 -> 0)

Use this as an execution PRD + operating loop for a TypeScript repo with many iterations and clustered fixes.

---

## PRD Shape

### 1) Objective
Reduce TypeScript compile errors from **312 to 0** with controlled, auditable iterations and cluster-specific acceptance criteria.

### 2) Scope
- In scope: all `tsc` errors in target packages/apps.
- Out of scope: unrelated refactors unless required to unblock typing.
- Constraint: each iteration must be safe to rerun after partial completion.

### 3) Error Clustering Model
Cluster errors by **story-level root cause**, not by error code alone.  
Example clusters:
- `API contract drift`: backend response type mismatch with frontend models
- `Nullability hardening`: missing guards after strict null checks
- `Generic inference breakage`: utility types no longer infer correctly
- `Legacy any migration`: implicit `any` islands in old modules
- `Module resolution`: path alias / package boundary typing failures

Each cluster gets:
- Owner
- Affected files/modules
- Risks
- Cluster-specific DoD + acceptance criteria (below)

### 4) Iteration Cadence
- Fixed max-iter cap (e.g. **20**)
- Each iteration targets **1-3 clusters max**
- Every iteration includes fresh baseline, implementation, and verification

### 5) Done Definition
- `tsc --noEmit` reports 0 errors
- All cluster acceptance criteria pass
- Separate reviewer pass approves (mandatory gate)

---

## Task-Specific Acceptance Criteria (Template + Example)

Avoid generic criteria like “tests pass.” Use story-level checks tied to each cluster.

### Per-Cluster Acceptance Criteria Template
For cluster `C`:
1. **Error delta**: all errors tagged to `C` are removed, and no new errors introduced outside approved collateral.
2. **Behavioral guardrail**: specific runtime behavior remains intact (define exact test/assertions).
3. **Type contract proof**: targeted type assertions or compile-time tests demonstrate the intended contract.
4. **Boundary check**: all interfaces crossing module/API boundary updated consistently.
5. **Regression hook**: lint/type/test check added or updated to prevent recurrence of same root cause.

### Example (API contract drift)
- All `TS2322/TS2339` tied to `/api/orders` response models are eliminated.
- `OrderSummary` and `OrderDetail` types share a single source contract in `types/orders.ts`.
- Integration test for `GET /orders/:id` validates optional `discount` handling.
- Frontend mapper compiles with strict mode and no `as any`.
- A contract test fails if backend drops required field `status`.

---

## Iteration Loop (Idempotent)

### Step 0: Bootstrap once
- Capture baseline snapshot:
  - total error count
  - errors grouped by cluster
  - unresolved “fundamental blockers” list
- Persist as machine-readable artifact (`type-error-backlog.json`).

### Step 1: Start iteration `i`
- Re-run fresh `tsc --noEmit` and regenerate cluster counts.
- Reconcile with backlog artifact (supports resumed/partial work).
- Pick highest-impact ready clusters (WIP limited).

### Step 2: Implement fixes
- Make minimal, cluster-focused changes.
- Keep commits/patches tagged with cluster ID.
- If partially fixed, record residual errors and leave cluster status `in_progress`.

### Step 3: Fresh verification (required every iteration)
Run all of:
1. `tsc --noEmit` (global)
2. Targeted tests for touched cluster(s)
3. Any contract/type-level assertions tied to cluster acceptance criteria

No cached “pass” allowed from prior iteration.

### Step 4: Evaluate iteration outcome
- Update backlog artifact with:
  - new total
  - per-cluster status (`done`, `in_progress`, `blocked`)
  - newly discovered blockers
- Compute trend: error burn rate and churn (new vs removed errors).

### Step 5: Gate before next iteration
Advance only if:
- Net non-negative progress, or
- A blocker was resolved that unlocks future progress.

---

## Idempotence Under Partial Fixes

Design rules:
- Source of truth is regenerated diagnostics + persistent backlog artifact.
- Cluster status transitions are monotonic except explicit rollback (`done -> in_progress` only when fresh diagnostics prove regression).
- Re-running same iteration with no new changes should produce identical plan and no duplicate tasks.
- Task identity = `(cluster_id, file_scope, error_signature_set)` to avoid redoing/duplicating work.

Operationally:
- Always re-cluster from current diagnostics, then merge with saved statuses.
- Never assume a previous “fixed” state without current compile evidence.

---

## Stop Conditions

### Success stop
Stop when all are true:
1. `tsc --noEmit` = 0 errors
2. every cluster marked `done` with acceptance criteria evidence
3. mandatory separate reviewer pass approved

### Fundamental-issue stop (early terminate/escalate)
Stop and escalate when any holds:
- Same blocker unchanged for `N` consecutive iterations (e.g. 3)
- Error count oscillates within tolerance band with no downward trend
- Required upstream dependency/schema/tooling defect prevents type closure
- Fix would violate agreed architecture/scope constraints

When triggered, emit:
- blocker report
- decisions needed
- proposed remediation paths

### Max-iteration cap
- Hard cap: e.g. `MAX_ITER=20`
- If cap reached before 0 errors:
  - produce final state snapshot
  - list unresolved clusters + blockers
  - recommend re-plan (scope split, architectural fix, upstream dependency action)

---

## Mandatory Separate Reviewer Pass (Before “Done”)

After loop claims success:
1. Reviewer independently pulls branch and runs fresh verification.
2. Reviewer audits each cluster’s acceptance evidence.
3. Reviewer checks for type unsound shortcuts (`any`, unsafe assertions, `@ts-ignore` creep).
4. Reviewer either:
   - approves and closes effort, or
   - reopens specific clusters with reasons.

No self-approval by implementation owner.

---

## Minimal Tracking Schema (practical)

Use a small artifact per run, e.g. `type-burndown-state.json`:
- `iteration`
- `total_errors`
- `clusters[]` with `id`, `root_cause`, `status`, `error_count`, `acceptance_checks`, `evidence`
- `blockers[]` with age and owner
- `trend` (`removed`, `introduced`, `net`)
- `stop_reason` (`success`, `fundamental_issue`, `max_iter`)

---

If you want, I can also provide this as a ready-to-use Markdown PRD template plus an iteration checklist your team can run in each PR.