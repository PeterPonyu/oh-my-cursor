Use this as a **deterministic PRD completion loop** for multi-story delivery.

## Iteration Loop (Story-Scoped, Reviewer-Gated)

1. **Initialize PRD run**
- Parse PRD into ordered stories `S1..Sn`.
- For each story, require explicit:
  - scope
  - task list
  - acceptance criteria (AC) as testable checks
  - required artifacts/evidence

2. **For each story `Si` (in order)**
- **Plan**: derive an execution checklist from `Si` AC only.
- **Implement**: make only `Si`-scoped changes.
- **Fresh verify**: run verification from clean/fresh state (no reused prior pass), capturing evidence.
- **Reviewer pass (separate)**: independent review checks `Si` against AC and evidence.
- **Decision**:
  - If verify + reviewer pass: mark `Si = Done`.
  - Else: log defects, create follow-up tasks for `Si`, iterate `Si` again.

3. **After all stories are Done**
- Run **PRD-level aggregation gate**:
  - all stories `Done`
  - no open defects linked to any story AC
  - required evidence complete per story
- If pass: declare PRD complete.
- Else: reopen failing stories and continue loop.

---

## Stop Condition

Stop only when **all** are true:

- Every story status is `Done`.
- Every story’s AC has a **fresh passing verification result** from current run.
- Every story has an explicit **independent reviewer approval** after verification.
- PRD-level gate passes with zero unresolved AC-linked defects.

---

## Max-Iteration Cap

Use two caps to prevent endless churn:

- **Per-story cap**: `max_story_iters = 5`
- **Global cap**: `max_prd_iters = 3 * (#stories)`

If either cap is hit:
- set PRD state to `Escalation Required`
- output blocking defects, owner, and decision needed (scope cut, AC rewrite, or dependency unblock)

---

## Idempotence Guarantee (Re-runs)

Guarantee deterministic re-runs via these rules:

- **Stable story IDs and AC IDs** (immutable keys).
- **Content-hash checkpoints** per story: `(code hash, AC set hash, test config hash)`.
- **No duplicate completion events**: writing `Done(Si)` is upsert-only keyed by story ID + checkpoint hash.
- **Fresh verification required each run**, but prior passing evidence is reusable only if hashes match exactly.
- Re-run with unchanged inputs yields identical statuses and no duplicated tasks/evidence records.

---

## Observable Success Signal (PRD Done Gate)

Declare whole PRD done only when this machine-checkable signal is true:

`PRD_DONE = AND over all stories i: (VERIFY_PASS_i && REVIEW_PASS_i && AC_COVERAGE_i == 100%) && OPEN_DEFECTS_AC_LINKED == 0`

Practical output artifact:
- a single `prd_completion_report` containing:
  - story-by-story AC pass matrix
  - verification timestamps/run IDs
  - reviewer approvals
  - final boolean `PRD_DONE=true`

If `PRD_DONE` is not true, PRD cannot be declared complete.