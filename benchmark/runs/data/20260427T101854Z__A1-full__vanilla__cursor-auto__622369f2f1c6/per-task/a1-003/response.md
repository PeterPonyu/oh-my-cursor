I’ll draft this as a concrete migration plan with foundational phases first, each with clear acceptance criteria and key risks, while preserving current CLI flags and output schema. I’m quickly checking the planning skill instructions before writing it.Migration should be staged so you first lock behavior, then change execution model, then optimize. This keeps CLI compatibility and output schema stable while de-risking the 50GB scale jump.

## Phase 0: Baseline and Contract Freeze (Foundational)

- Define and freeze the **external contract**:
  - CLI flags and semantics (names, defaults, required/optional behavior, exit codes).
  - Output schema (column names, order, types, formatting/null rules, sort guarantees).
- Add a reproducible baseline run on representative data samples (small + medium + one “worst-case” slice).
- Capture golden artifacts: row counts, checksums, schema fingerprints, critical aggregate metrics.

**Acceptance criteria**
- Existing CLI behavior is documented and machine-checked (snapshot tests for `--help` and flag combinations).
- Output schema fingerprint test exists and passes against current implementation.
- Baseline metrics and golden outputs are versioned and reproducible in CI/local.

**Risks**
- Hidden “implicit” behavior in legacy script (e.g., dtype coercions, timezone parsing).
- Incomplete golden coverage misses edge-case regressions.
- Mitigation: include pathological samples (bad rows, quoted commas, null-heavy, encoding anomalies).

---

## Phase 1: Internal Architecture Skeleton (No Behavior Change)

- Introduce pipeline structure behind current CLI entrypoint:
  - `extract` (chunk reader), `transform` (pure function), `load` (writer/merger), `state` (checkpointing).
- Keep current code path as fallback; new path behind feature flag/internal switch.
- Define explicit intermediate contracts (DataFrame schema in/out per stage).

**Acceptance criteria**
- Running with legacy mode and new skeleton mode yields byte-equivalent outputs on test datasets.
- Existing CLI flags remain unchanged and invoke the same entrypoint.
- Unit tests cover stage boundaries and schema invariants.

**Risks**
- Refactor accidentally changes transformation order or floating-point behavior.
- Mitigation: strict equivalence tests and deterministic sort/index normalization before comparison.

---

## Phase 2: Chunked Processing Engine

- Replace full-file read with chunked CSV ingestion (`chunksize`-driven), preserving transform logic.
- Implement deterministic chunk handling (stable ordering key and deterministic merge strategy).
- Add configurable memory/throughput knobs internally (not changing public CLI flags).

**Acceptance criteria**
- Pipeline processes 50GB without OOM on target infra.
- Output matches golden schema and validated metrics (row count, key aggregates, checksums within defined tolerance).
- Peak memory stays below defined threshold (e.g., <70% of available RAM during run).

**Risks**
- Cross-chunk operations (dedupe/window/groupby) can produce incorrect results if naively chunked.
- Chunk boundary effects (late-arriving keys, partial groups).
- Mitigation: implement explicit two-pass or stateful aggregation strategy for cross-chunk semantics.

---

## Phase 3: Resumability and Checkpointing

- Add durable checkpoints:
  - input position/progress,
  - transform state (if stateful),
  - output commit markers.
- Ensure idempotent writes (temp files + atomic rename / transactional partition commit).
- Implement restart logic that resumes from last successful checkpoint with no duplicate output.

**Acceptance criteria**
- Forced interruption tests pass (kill process mid-run, restart, final output equals uninterrupted run).
- No duplicated or missing rows after resume.
- Checkpoint corruption handling is defined (fail fast or safe rollback) and tested.

**Risks**
- Partial writes causing silent duplicates/corruption.
- Checkpoint drift when input files change between runs.
- Mitigation: input fingerprinting/version checks and atomic commit protocol.

---

## Phase 4: Performance Tuning and Operational Hardening

- Profile hotspots (parse, transform, serialize, IO waits), then optimize high-impact sections only.
- Add structured run telemetry: throughput per stage, lag, retries, bad-row counts, checkpoint intervals.
- Add backpressure/retry behavior for IO failures and configurable failure policy for malformed rows.

**Acceptance criteria**
- Nightly SLA met on full 50GB with headroom (e.g., completes in target window + 20% margin).
- Observability dashboard/logs can answer: progress %, ETA, failure point, resume point.
- Error budget policy enforced (e.g., malformed rows threshold triggers fail/alert).

**Risks**
- Over-optimization introduces divergence from legacy semantics.
- Insufficient observability makes incident triage slow.
- Mitigation: keep optimization changes behind regression suite + contract tests.

---

## Phase 5: Cutover, Parallel Run, and Decommission

- Run old and new pipelines in parallel for defined burn-in period (e.g., 2-4 weeks).
- Automate daily diff checks on outputs (schema, row-level keyed diff, aggregates).
- Promote new pipeline to primary; keep rollback toggle for one release window; then retire legacy path.

**Acceptance criteria**
- Parallel run shows no unexplained schema drift and differences within approved tolerance.
- On-call runbook exists: restart, resume, rollback, and incident procedures.
- Legacy implementation decommissioned only after stability SLO is met for burn-in duration.

**Risks**
- Undetected low-frequency discrepancies appear only on specific days/data shapes.
- Operational team not prepared for new failure modes.
- Mitigation: extended burn-in + runbook drills + explicit rollback gate.

---

## Cross-Phase Guardrails (Must Hold Throughout)

- **CLI compatibility:** no flag name/removal/default semantic changes.
- **Output schema invariance:** unchanged column set/order/types/nullability/format.
- **Determinism:** same input + config => same output.
- **Test strategy:** contract tests, interruption/resume tests, and scale tests are mandatory gates for promotion.

If helpful, I can turn this into a week-by-week execution schedule with owners, effort estimates, and a minimal test matrix you can hand to engineering + QA.