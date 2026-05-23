## Iterative Type-Error Burn-Down Loop (312 -> 0)

### 1) PRD Shape (must be filled before coding starts)

Use this as a **living PRD** updated every iteration.

```md
# Type Error Elimination PRD

## Objective
Reduce TypeScript compiler errors from 312 to 0 without runtime regressions.

## Scope
- In scope: compile-time type issues in `tsc --noEmit` output.
- Out of scope: feature changes unrelated to type fixes.

## Baseline
- Command: `pnpm tsc --noEmit` (or repo equivalent)
- Baseline error count: 312
- Baseline artifact: `artifacts/iter-000/tsc.json` + `tsc.txt`
- Baseline commit SHA: <sha>

## Error Clusters (story units)
Each cluster has:
- Cluster ID
- Error codes (e.g., TS2322, TS2345)
- File/module boundary
- Root cause hypothesis
- Risk level
- Story-level acceptance criteria (specific, measurable)

## Iteration Policy
- Max iterations: <N, e.g., 25>
- Fresh verification required each iteration
- Idempotent rerun behavior required
- Reviewer gate required before "done"

## Done Conditions
- Success stop condition met OR fundamental issue stop condition met
```

---

### 2) Clustering Model (story-level, not per-line)

Cluster by **(error code + module + root cause)**, not just code.  
Examples of meaningful clusters:

- `C1`: TS2345 in API handlers due to `unknown` request payloads
- `C2`: TS2322 in Redux selectors due to nullable state mismatch
- `C3`: TS7053 in dynamic key access in config loaders
- `C4`: TS2741 missing properties in test fixture builders

Each cluster becomes a story with tailored acceptance criteria.

---

### 3) Task-Specific Acceptance Criteria (examples)

Avoid generic criteria like “all errors fixed.” Require criteria per cluster:

- **C1 (TS2345 request payload unknown)**
  - All handlers in `src/api/**` narrow payload using shared guards before service calls.
  - No `as any` introduced in `src/api/**`.
  - `tsc --noEmit` reports **0 TS2345** for files under `src/api/**`.
  - Existing API contract tests pass.

- **C2 (TS2322 nullable selector mismatch)**
  - Selector return types align with `RootState` nullability model.
  - No non-null assertion (`!`) added in selector layer.
  - `TS2322` eliminated in `src/store/selectors/**`.
  - Unit tests for selectors cover null and populated states.

- **C3 (TS7053 dynamic key indexing)**
  - Indexing uses `keyof`-constrained keys or typed record maps.
  - No broad `[key: string]: any` added to silence errors.
  - `TS7053` reduced to zero in `src/config/**`.
  - Config parse smoke test passes with sample env sets.

- **C4 (TS2741 fixture missing props)**
  - Test builders expose defaults for required fields.
  - Required-domain types are not weakened in production code.
  - `TS2741` zero in `test/**`.
  - Test suite remains green.

---

### 4) Iteration Loop (with fresh verification + idempotence)

For iteration `i = 1..maxIter`:

1. **Re-baseline (fresh)**
   - Run `tsc --noEmit --pretty false` from clean working tree state.
   - Emit machine artifact (`tsc.json`/parsed) + raw log.
   - Recompute cluster map from current errors (do not trust prior map blindly).

2. **Select workset**
   - Pick 1–3 clusters by priority:
     - Highest count
     - Highest unblock impact
     - Lowest regression risk first (or inverse if strategic)
   - Freeze selected cluster IDs for this iteration.

3. **Plan per cluster**
   - Record root cause + intended fix pattern.
   - Record cluster-specific acceptance checks.

4. **Implement minimal fix set**
   - Fix only targeted clusters unless opportunistic adjacent fix is trivial and safe.
   - Avoid “suppression-only” changes (`any`, blanket `@ts-ignore`) unless explicitly approved and tracked as debt.

5. **Fresh verification (mandatory)**
   - Re-run `tsc --noEmit`.
   - Compare against iteration start:
     - targeted cluster count down?
     - total errors non-increasing?
     - new error families introduced?
   - Run scoped tests/lint for touched modules.

6. **Idempotence check under partial fixes**
   - Re-run the same fix script/codemod/commands (if any) on current branch.
   - Expect no additional file changes OR deterministic no-op output.
   - Re-run `tsc` again; counts stable.
   - If non-idempotent, patch tooling/process before next iteration.

7. **Iteration review packet**
   - Produce short report:
     - Before vs after total
     - Cluster-level delta
     - New risks/debt introduced
     - Files touched
     - Next recommended clusters

---

### 5) Stop Conditions

#### A) Success stop condition
Declare engineering-complete only when all are true:

- `tsc --noEmit` returns 0 errors.
- Last 2 consecutive fresh runs also return 0 (stability check).
- No temporary suppressions added without explicit debt ticket.
- Separate reviewer pass approved (see section 7).

#### B) Fundamental issue stop condition
Stop and escalate when any of these persists for `K` consecutive iterations (e.g., 2–3):

- Error count plateaus (no net reduction) despite valid fixes.
- Fixing one cluster systematically reintroduces another (type-model conflict).
- Upstream/generated/third-party typings are broken and outside repo control.
- Required architectural change exceeds iteration budget.

Escalation output must include:
- blocking root causes,
- options (schema redesign, tsconfig strategy, dependency upgrade, API typing contract rewrite),
- estimated effort and risk.

#### C) Max-iteration cap
- Hard cap: `maxIter` (e.g., 25).
- At cap, stop automatically and output:
  - achieved delta (`312 -> X`),
  - unresolved clusters,
  - recommended continuation plan.

---

### 6) Idempotence Guarantees (process-level)

Make loop rerunnable after interruption:

- Every iteration writes artifacts to `artifacts/iter-<nnn>/`.
- Cluster IDs are deterministic (`errorCode + modulePathHash + rootCauseTag`).
- Fix tooling is deterministic (same input => same edits/no-op).
- Progress ledger (`progress.json`) records:
  - last completed iteration,
  - cluster statuses (`open/in_progress/done/blocked`),
  - last verified counts.
- On restart, system recomputes current errors and reconciles ledger, never assuming prior success.

---

### 7) Separate Reviewer Pass (required before “done”)

After implementation reports 0 errors:

1. **Independent reviewer (human or separate agent) checks**
   - Validate no unsafe widenings (`any`, `unknown as T`, blanket ignores).
   - Confirm acceptance criteria per cluster were actually met.
   - Spot-check representative high-risk modules.
   - Re-run full verification suite from clean checkout.

2. **Reviewer verdict states**
   - `approved`
   - `approved-with-debt` (must list debt tickets)
   - `rejected` (must list blocking findings)

Only `approved` or explicitly accepted `approved-with-debt` can close the PRD.

---

### 8) Suggested Operational Defaults

- `maxIter = 25`
- `cluster batch size = 2`
- `plateau threshold = 2 iterations`
- `fundamental issue trigger = 2 repeats`
- `stability runs at zero = 2`

---

If you want, I can also provide this as a ready-to-use `TYPE_ERROR_PRD.md` template plus an `iteration-report.md` template your team can fill each cycle.