I’ll draft this as a structured migration plan with foundational phases first, plus acceptance criteria and key risks per phase. I’m quickly checking the planning skill guidance so the plan format is rigorous and actionable.## Migration Plan: 50GB Pandas ETL -> Chunked, Resumable Pipeline

### Assumptions (to lock before execution)
- Existing CLI contract (flags, names, defaults, help text) must remain unchanged.
- Output schema means identical column set, names, types/coercions, ordering, and null handling.
- Nightly schedule/window is fixed and cannot expand significantly.

---

### Phase 1 — Baseline, Contract Freeze, and Test Harness (Foundational)
**Goal:** Make current behavior measurable and lock interfaces before refactor.

**Work**
- Snapshot current CLI behavior (`--help`, flag parsing, defaults, error paths).
- Capture schema contract from current output (including column order/type coercion rules).
- Create golden-data fixtures (small + medium samples) and baseline output artifacts.
- Add regression checks for:
  - CLI compatibility
  - Output schema compatibility
  - Deterministic output equivalence on fixture data

**Acceptance criteria**
- Existing and new entrypoints accept identical CLI flags and defaults.
- Golden fixture runs produce byte-stable output (or documented acceptable tolerance for ordering/formatting if needed).
- Schema validator fails on any column/type/order drift.
- Baseline performance metrics collected (runtime, peak memory, rows/sec, failure modes).

**Risks**
- **Hidden implicit behavior** in current script (e.g., dtype inference quirks) not documented.
- **Mitigation:** Freeze with executable tests before any migration code lands.

---

### Phase 2 — Pipeline Skeleton with Checkpointing and Idempotency
**Goal:** Introduce resumable architecture without changing transformations yet.

**Work**
- Wrap ETL into explicit stages (ingest -> transform -> write/finalize).
- Add run metadata store (local files or DB table) for checkpoints:
  - run_id, input file fingerprint, chunk index/range, stage status, timestamps
- Add resumability semantics:
  - restart from last successful checkpoint
  - skip completed chunks safely
- Define idempotent write strategy (temp outputs + atomic finalize/rename).

**Acceptance criteria**
- Killing process mid-run and restarting resumes from last checkpoint, not from scratch.
- Re-running same input does not duplicate output rows.
- Failed chunk can be retried independently.
- Finalization step is atomic (no partially published final dataset).

**Risks**
- **Checkpoint corruption / race conditions** causing false-complete state.
- **Mitigation:** transactional checkpoint updates + checksum/fingerprint validation.

---

### Phase 3 — Chunked IO and Memory-Bounded Processing
**Goal:** Replace monolithic load with chunked processing to handle 50GB reliably.

**Work**
- Implement chunked CSV reading (`chunksize`-driven) with stable dtype config.
- Refactor transforms to operate chunk-by-chunk.
- Ensure logic needing global state (dedupe, aggregations, joins) uses a two-pass or staged strategy.
- Add configurable chunk sizing and backpressure based on memory headroom.
- Persist intermediate chunk outputs in deterministic naming scheme.

**Acceptance criteria**
- 50GB input completes within memory ceiling on target node (no OOM).
- Peak memory remains within agreed threshold (e.g., <70–80% of machine RAM).
- Row counts and schema match baseline expectations.
- Chunk size can be tuned without code changes.

**Risks**
- **Non-associative transforms** may diverge from single-pass semantics.
- **Mitigation:** isolate global operations into explicit merge/final stages with tests proving equivalence.

---

### Phase 4 — CLI Compatibility Layer and Operational Safety
**Goal:** Preserve user/operator experience while swapping internals.

**Work**
- Keep original CLI flags exactly; map them to pipeline config internally.
- Preserve existing log/error messages where contractually relevant.
- Add structured logging + run summary (processed chunks, skipped, retried, duration).
- Add guardrails: disk space checks, input existence/fingerprint checks, lockfile/single-run protection.

**Acceptance criteria**
- Existing scheduler/job wrappers run unchanged.
- CLI snapshots from Phase 1 pass exactly.
- On common failures (disk full, bad CSV row, interruption), job exits predictably with actionable diagnostics.
- No concurrent run corruption (lock enforcement proven).

**Risks**
- **Behavior drift at CLI edge cases** (bad args, partial flags).
- **Mitigation:** explicit compatibility tests from baseline matrix.

---

### Phase 5 — Performance Tuning and Parallelism (Optional but likely needed)
**Goal:** Meet nightly SLA for 50GB with safe throughput improvements.

**Work**
- Profile stage-wise bottlenecks (parse, transform, write, finalize).
- Optimize dtype declarations, vectorization, and expensive operations.
- Introduce controlled parallelism where safe (e.g., chunk transform workers) with deterministic merge.
- Tune IO (compression, buffering, local temp disk usage).

**Acceptance criteria**
- End-to-end runtime meets nightly SLA with safety margin.
- Throughput/latency regressions are tracked by benchmark suite.
- Parallel mode produces identical schema and equivalent data results vs serial mode.
- Retry/resume semantics remain correct under parallel execution.

**Risks**
- **Parallel nondeterminism** (ordering, race on shared state).
- **Mitigation:** constrain parallelism to embarrassingly parallel stages + deterministic merge + consistency checks.

---

### Phase 6 — Cutover, Shadow Runs, and Rollback
**Goal:** Move to production safely with confidence and fallback.

**Work**
- Run shadow mode for N nights (new pipeline in parallel, old remains source of truth).
- Compare outputs (row count, schema, key aggregates, checksums where possible).
- Define go/no-go criteria and rollback trigger thresholds.
- Document runbook: restart, resume, failure triage, rollback steps.

**Acceptance criteria**
- Shadow runs pass for agreed consecutive nights (e.g., 5–7).
- No schema drift; key metric diffs within agreed tolerances.
- Cutover can be rolled back within one run window.
- On-call/runbook is complete and tested via tabletop.

**Risks**
- **Late-discovered data parity gaps** only visible at full scale.
- **Mitigation:** mandatory shadow period + automated diff reports before cutover.

---

## Cross-Phase Risk Register (Top)
- **Schema drift risk:** enforce schema contract tests in CI and at runtime pre-finalize.
- **Resume correctness risk:** checkpoint integrity with fingerprints + replay tests.
- **Disk pressure risk:** chunk/intermediate files can exhaust storage; add preflight capacity checks + cleanup policy.
- **Silent data quality regressions:** nightly validation suite on counts/nulls/uniques/key aggregates.
- **Operational complexity:** provide runbook and clear observability (stage timings, retries, failure reasons).

---

## Suggested Implementation Order (strict)
1. Phase 1 baseline/contract freeze  
2. Phase 2 checkpointed skeleton  
3. Phase 3 chunked processing  
4. Phase 4 CLI compatibility + safeguards  
5. Phase 5 performance/parallel tuning  
6. Phase 6 shadow + cutover  

If helpful, I can turn this into a one-page execution checklist with concrete test cases and sample pass/fail gates for each phase.