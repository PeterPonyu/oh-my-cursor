Use a **bounded retry harness** around the flaky test, with strict safety checks:

- **Stop condition**
  - Exit immediately on first confirmed pass (`exit code 0` + expected success marker in output).
  - Also stop when attempts reach cap or a non-retriable error appears (e.g., compile failure, missing dependency, test-discovery error).

- **Idempotence guarantee**
  - Each attempt runs in an isolated, resettable context:
    - fresh test process,
    - deterministic seed/config where possible,
    - cleanup/reset hooks before each run (temp dirs, DB fixtures, mocks, ports).
  - No cross-attempt mutation is allowed to influence outcome.

- **Max-iteration cap**
  - Hard cap like `N=5` (or time-budget cap, e.g. `<=10 min`, whichever hits first).
  - Example with 85% pass rate: failure across 5 independent tries is `0.15^5 ≈ 0.0076%`, usually enough for CI stabilization without infinite retries.

- **Observable success signal**
  - Treat success as a machine-checkable composite signal:
    - test runner exit code `0`,
    - target test name reported as `PASSED`,
    - optional artifact/metric check (e.g., expected log line or snapshot file generated).
  - Avoid “no crash” as success; require explicit positive proof.

- **Why it is safe to run repeatedly**
  - Bounded (cannot loop forever),
  - isolated attempts (no accumulating state),
  - explicit retry policy (only retriable failure classes),
  - auditable logs per attempt (`attempt #`, reason, duration, final verdict),
  - deterministic cleanup on every iteration and on exit.

If useful, I can also give you a drop-in pseudocode/shell template for CI (`bash`, `pytest`, `jest`, etc.).