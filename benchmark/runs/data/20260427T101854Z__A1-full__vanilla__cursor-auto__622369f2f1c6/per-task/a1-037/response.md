Use a **bounded, evidence-driven retry wrapper** around the flaky test, with strict safety checks.

- **Stop condition**
  - Stop immediately on first **verified pass** (test exits 0 *and* emits the expected success marker), or when retries hit cap.
  - Also stop early on **hard-fail signatures** (e.g., syntax error, missing dependency, setup failure) that retries cannot fix.

- **Idempotence guarantee**
  - Run each attempt in an **isolated, reset state**: fresh temp workspace/DB schema, deterministic seed, cleared caches, unique run IDs.
  - No shared mutable state between attempts; cleanup runs in `finally` so a failed attempt cannot poison the next.
  - The loop never performs non-test side effects (no external writes without mock/sandbox).

- **Max-iteration cap**
  - `max_attempts = 5` (tunable), with backoff (`1s, 2s, 4s, 8s`) and optional jitter.
  - At 85% pass probability, failure after 5 attempts is `0.15^5 ≈ 0.000076` (~0.0076%), so this sharply reduces false red builds while staying bounded.

- **Observable success signal**
  - Require both:
    1. Process exit code `0`
    2. Machine-parseable success evidence (e.g., JUnit XML shows `failures=0` for target test, or log token `TEST_PASS:<name>`).
  - Don’t trust plain human-readable logs alone.

- **What makes repeated runs safe**
  - Bounded attempts + deterministic reset + explicit non-retryable error filter + auditable per-attempt logs/metrics.
  - Record `attempt_count`, durations, and final disposition (`pass_on_n`, `hard_fail`, `exhausted`) so behavior is transparent and reversible.

Minimal pseudocode:

```python
for attempt in range(1, max_attempts + 1):
    reset_isolated_state()
    result = run_test_once()
    if is_hard_fail(result):
        return FAIL_HARD
    if result.exit_code == 0 and has_success_marker(result):
        return PASS(attempt)
    sleep(backoff(attempt))
return FAIL_EXHAUSTED
```

If you want, I can adapt this into a concrete Bash/Python wrapper for your CI system (GitHub Actions, GitLab CI, Jenkins, etc.).