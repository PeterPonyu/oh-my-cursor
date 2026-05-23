## CI-to-Green Loop Spec

### Contract
- **Input:** `failing_checks[]` (each with check name, run URL/id, commit SHA, failure summary if available).
- **Output:** Updated commit(s) and/or config changes that make all checks pass, or a declared **fundamental failure** with evidence.
- **Hard rule:** A check is **never** considered green by inference, local belief, or “likely fixed.” Only fresh CI evidence counts.

### Per-Iteration Step (single loop cycle)
1. **Refresh truth from CI**
   - Pull latest status for the target SHA (or newest pushed SHA if changed).
   - Build `open_failures[]` from checks currently failing/flaky/pending-timeout.
2. **Select one actionable failure slice**
   - Pick highest-priority failing check (deterministic ordering: required > non-required, then oldest failing).
   - Extract concrete failure signature (test name, stack trace, lint rule, build error, timeout phase).
3. **Reproduce or inspect locally (if possible)**
   - Run the narrowest command that matches CI failure scope.
   - Capture artifacts/log snippets tied to the same signature.
4. **Apply minimal fix**
   - Change only what is needed for the selected signature.
   - Keep change atomic and reversible.
5. **Validate locally**
   - Re-run targeted checks first, then any required broader gate impacted by the change.
6. **Push and re-run CI**
   - Push commit; trigger/await CI for affected checks.
7. **Collect fresh evidence**
   - Record check conclusion, run URL, SHA, timestamp, and relevant log excerpt.
8. **Classify outcome**
   - If targeted check green and no new regressions: continue loop if other failures remain.
   - If unchanged/new failure mode: treat as next failure slice or escalate.

### Fresh Evidence Requirement (mandatory)
- A status claim (`pass`/`fail`) is valid only if backed by:
  - CI run on the **current SHA**,
  - Non-stale timestamp (from current iteration),
  - Direct check result (`success`, `failure`, `cancelled`, `timed_out`) and run URL.
- Local test pass is supporting evidence only, not final success proof.

### Idempotence Requirements
- Re-running the same iteration with no new commit must not mutate state except refreshed observations.
- Any automation step must be safe to run repeatedly (no duplicate migrations, no repeated version bumps unless explicitly required).
- State tracking should key by `(check_name, SHA, failure_signature)` so repeated failures are recognized, not re-triaged as new.

### Max-Iteration Cap
- **Default cap:** `max_iter = min(12, 3 * initial_required_failing_checks + 3)`.
- Also enforce:
  - **Per-check cap:** 4 attempts per unique failure signature.
  - **No-progress cap:** stop after 2 consecutive iterations with no delta in failing set/signature quality.

### Stop Conditions

#### Success Stop
- All required checks for target branch protection are `success` on the same final SHA.
- No required checks pending/running/unknown.
- Record observable success signal (below).

#### Fundamental-Failure Stop
Declare and stop when any holds:
- Reproducible external blocker (e.g., upstream outage, revoked credentials, broken dependency mirror) with evidence.
- Policy/permission block (cannot modify protected resource needed to fix).
- Architectural contradiction (requested behavior conflicts with enforced invariants) demonstrated by failing proof.
- Iteration caps exceeded without measurable progress.
- In each case, produce blocker dossier: what was tried, evidence links, and what decision/input is required.

### Observable Success Signal
- Machine-verifiable tuple:
  - `final_sha`
  - `required_checks_all_green = true`
  - `ci_run_urls[]` for each required check
  - `observed_at` timestamp
- Optional human summary: “Green on SHA X with N/N required checks passed.”

### Explicit Prohibition: No Green by Inference
- Disallowed examples:
  - “Local tests passed so CI is probably green.”
  - “Same error disappeared in logs, mark resolved.”
  - “Unrelated check likely unaffected, assume pass.”
- Allowed only:
  - Direct CI conclusion for each required check on current SHA.  
  - If evidence missing, status is `unknown`, not `green`.