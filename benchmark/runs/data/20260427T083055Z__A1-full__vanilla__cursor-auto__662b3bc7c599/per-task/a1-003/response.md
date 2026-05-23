I’ll produce a phased migration plan with acceptance criteria and risks, keeping your CLI and output schema constraints fixed. I’ll quickly load the planning skill guidance first, then tailor the plan to a 50GB CSV ETL migration.## Migration Plan: Pandas Script -> Chunked, Resumable 50GB ETL

### Phase 1: Baseline, Contracts, and Safety Rails (Foundational)
- Freeze the **external contract**: keep current CLI flags/semantics and output schema exactly as-is.
- Capture a golden run from current job on a representative sample (and, if possible, one full historical run artifact).
- Define SLAs/SLOs (runtime target, memory ceiling, failure/retry behavior, freshness window).
- Add schema and CLI compatibility tests before refactor begins.

**Acceptance criteria**
- Existing CLI invocation matrix passes unchanged (`--help`, required/optional flags, defaults).
- Output schema checks pass byte-for-byte compatible on headers/types/order and null handling.
- Golden dataset comparison exists and is automated in CI (or nightly validation pipeline).

**Key risks**
- Hidden behavioral coupling in script (implicit defaults, side effects).
- “Schema unchanged” misunderstood (type coercions, ordering, formatting drift).
- Missing baseline metrics makes post-migration regressions hard to prove.

---

### Phase 2: Pipeline Skeleton + State Model
- Introduce a staged pipeline architecture (`extract -> transform -> load`) behind the same CLI entrypoint.
- Add checkpoint/state store for resumability (e.g., local sqlite/postgres/object-store manifest), keyed by input file + chunk id + transform version.
- Define idempotency strategy for writes (upsert/atomic rename/temp outputs + commit marker).
- Add run metadata (run id, chunk status, retries, timings) for observability.

**Acceptance criteria**
- Job can stop mid-run and resume without reprocessing completed chunks.
- Re-running same input is idempotent (no duplicate output rows/files).
- Checkpoint state survives process restarts and records chunk lifecycle (`pending/running/success/failed`).

**Key risks**
- Corrupt/partial checkpoint state causing skipped or duplicated chunks.
- Non-idempotent load step breaks correctness on retries.
- State versioning issues when transform logic changes.

---

### Phase 3: Chunked Extraction and Memory-Bounded Transform
- Replace full-file pandas load with chunked reads (`read_csv(..., chunksize=...)`) and bounded-memory transforms.
- Refactor transforms to be chunk-local where possible; isolate required cross-chunk/global operations.
- Introduce deterministic chunk sizing and backpressure controls (workers/concurrency tuned to host capacity).
- Validate parsing edge cases at scale (quoted delimiters, malformed rows, encoding, dtype drift).

**Acceptance criteria**
- Peak memory remains under defined threshold for full 50GB run.
- End-to-end output remains schema-compatible and row-equivalent to baseline (within approved deterministic tolerance rules).
- Throughput is stable with no OOM across multiple nightly runs.

**Key risks**
- Global aggregations/window logic may not be chunk-safe.
- Dtype inference differences between chunks can alter downstream behavior.
- Performance regressions from too-small chunks or excessive serialization overhead.

---

### Phase 4: Load Strategy Hardening + Atomic Publish
- Implement robust load path: write chunk outputs to staging, validate, then atomically publish final artifact(s).
- Add dedupe/merge logic if output is partitioned per chunk but consumed as unified dataset.
- Enforce deterministic ordering/rules where current consumers implicitly depend on it.
- Add dead-letter/error capture for bad records with policy-driven handling.

**Acceptance criteria**
- No partially published outputs visible to downstream consumers.
- Final outputs are complete and consistent after success, and unchanged after failed runs.
- Recovery from chunk-level failures does not require full rerun.

**Key risks**
- Atomicity gaps on filesystem/object store semantics.
- Downstream consumers relying on undocumented ordering/layout.
- Error-row handling silently dropping required records.

---

### Phase 5: Operationalization (Observability, Alerts, Runbooks)
- Add structured logs and metrics: rows/sec, chunk latency, retry counts, bad-row counts, checkpoint lag.
- Add alerting thresholds for runtime overruns, repeated chunk failures, schema drift, and zero-row anomalies.
- Document runbook: restart procedure, backfill procedure, checkpoint reset policy, rollback switch.
- Add feature flag or mode toggle for controlled cutover (`legacy` vs `pipeline` under same CLI).

**Acceptance criteria**
- On-call can diagnose failures from logs/metrics without reading code.
- Alerts fire for simulated failure scenarios and are actionable.
- Runbook successfully used in at least one game-day dry run.

**Key risks**
- Insufficient telemetry hides slow degradation.
- Over-alerting causes noise and missed real incidents.
- Ambiguous rollback steps prolong outage windows.

---

### Phase 6: Parallel Shadow Runs and Cutover
- Run new pipeline in shadow mode alongside existing nightly job for a validation window (e.g., 1-2 weeks).
- Compare outputs automatically each run (schema + row counts + key aggregates + sampled row-level diffs).
- Gate production switch on pass-rate threshold; keep fast rollback path.
- After cutover, keep legacy path available for limited fallback window, then retire.

**Acceptance criteria**
- Shadow-run diff reports meet agreed thresholds for consecutive days.
- Cutover completed with no missed SLA window.
- Rollback tested and verified before legacy retirement.

**Key risks**
- Drift appears only under rare nightly data patterns.
- Dual-run infrastructure cost/time pressure shortens validation prematurely.
- Unclear ownership for diff triage delays go-live.

---

## Cross-Phase Guardrails (Always Enforced)
- **CLI compatibility:** no flag additions/removals/semantic changes visible to users unless explicitly backward-compatible.
- **Schema immutability:** automated contract tests at every stage.
- **Versioned checkpoints:** include transform/version hash to prevent unsafe resumes after code changes.
- **Determinism:** document and test ordering/rounding/null behavior to avoid subtle downstream breaks.

If you want, I can turn this into a concrete implementation backlog next (epics -> tickets -> test plan), including a suggested checkpoint schema and diff-validation spec.