Use a **bounded, signal-driven retry wrapper** around the flaky test.

- **Stop condition**
  - Stop immediately on first *observable pass* (all assertions green and test process exit code `0`).
  - Stop early on *hard-fail classes* that retries cannot fix (e.g., syntax/import errors, environment boot failure).
  - Otherwise continue until max attempts is reached.

- **Idempotence guarantee**
  - Run each attempt in an isolated test context (fresh fixture/setup + teardown every attempt).
  - Ensure the test does not reuse mutable shared state across attempts (DB rows keyed by unique run-id, temp dirs per attempt, mocks reset each run).
  - Treat retries as read-only against external systems where possible; if writes are needed, use deterministic upsert/cleanup keyed by run-id.

- **Max-iteration cap**
  - Set `max_attempts = 3` (good balance for ~85% pass rate: residual false-fail drops from 15% to ~0.34% if independent).
  - Add small backoff/jitter between attempts (e.g., 2s, 5s) to avoid immediately repeating the same transient condition.

- **Observable success signal**
  - A machine-checkable result: test runner reports `PASSED` for that specific test id and exits `0`.
  - Emit structured attempt logs: `attempt=n`, `result=pass|fail`, `failure_class`, `duration_ms`.
  - Publish final status as `stable_pass` (passed within cap) or `unstable_fail` (exhausted retries).

- **Why it is safe to run repeatedly**
  - Bounded attempts prevent infinite loops and runaway CI cost.
  - Isolation + deterministic cleanup prevents state accumulation/corruption.
  - Hard-fail short-circuit avoids masking real regressions.
  - Structured telemetry keeps flakiness visible (you can alert if retries were needed), so this is a temporary stabilizer, not silent suppression.

If you want, I can also provide a drop-in pseudocode/template for Jest, Pytest, or Playwright.