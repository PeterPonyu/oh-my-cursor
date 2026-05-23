I’ll design this as an executable workflow spec you can run repeatedly, with explicit gates for per-story acceptance, independent reviewer verification, and a strict “PRD done” signal. I’m first checking the planning skill to align the structure.Use this as a **state-machine loop** for a multi-story PRD.

## Iteration Loop

1. **Initialize run context**
- Inputs: PRD stories `S1..Sn`, each with task-specific acceptance criteria `ACi`.
- Create immutable `run_id`, and per-story status: `NotStarted | InProgress | Verified | ReviewerApproved | Done`.
- Load prior evidence store (for reruns): implementation artifact hashes, test logs, reviewer decisions.

2. **For each story in order (`i = 1..n`)**
- **Plan slice**: derive concrete tasks for `Si` only, tied directly to `ACi`.
- **Execute**: implement tasks for `Si`.
- **Fresh verification pass (required, always rerun)**:
  - Run story-scoped checks/tests from clean state.
  - Produce `verification_report_i` with timestamp + artifact hashes.
  - Gate: all `ACi` pass in this fresh run.
- **Independent reviewer pass (separate role/context)**:
  - Reviewer inspects code + `verification_report_i`.
  - Outcome: `Approved` or `ChangesRequested`.
- If `ChangesRequested`: loop on same story (re-plan deltas -> execute -> fresh verify -> reviewer pass).
- If `Approved`: mark `Si = Done`, move to next story.

3. **PRD completion gate**
- When all stories are `Done`, run final PRD-level consistency check (cross-story regressions/integration).
- If pass, declare PRD done; else reopen affected story(ies) and continue loop.

---

## Required Controls

- **Stop condition**
  - `forall i in [1..n]: story_status_i == Done`
  - and final PRD-level consistency check is green.

- **Max-iteration cap**
  - Per story cap: `MAX_STORY_ITERS` (suggest 5).
  - PRD cap: `MAX_PRD_ITERS` (suggest `2 * n` full sweeps).
  - On cap hit: halt with explicit `Blocked` state + unresolved criteria list + decision needed.

- **Idempotence guarantee for reruns**
  - Deterministic story key: `story_id + AC_version + codebase_commit`.
  - Persist run ledger entries as append-only records.
  - Re-running loop:
    - never duplicates completed evidence,
    - recomputes fresh verification each time,
    - only advances state when newer evidence supersedes older evidence for the same key.
  - Same inputs + same code state => same state transitions and final verdict.

- **Observable success signal (single gate to declare whole PRD done)**
  - Emit one machine-readable event, e.g.:
    - `PRD_DONE(run_id, prd_id, stories_done=n/n, final_verify=PASS, reviewer_signoffs=n, timestamp, evidence_digest)`
  - Declaration is valid **only** when this event exists and is signed by both:
    - verification pipeline (fresh pass),
    - independent reviewer workflow (all stories approved).

If you want, I can convert this into a ready-to-run YAML workflow template (states, transitions, and required artifacts).