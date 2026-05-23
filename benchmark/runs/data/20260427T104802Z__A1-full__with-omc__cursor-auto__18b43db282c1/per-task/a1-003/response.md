I’ll produce a concrete migration plan with phases, acceptance criteria, and key risks, keeping your CLI flags and output schema fixed. I’m quickly checking the planning skill guidance first so the format is actionable.Migration plan below is ordered foundation-first and keeps two hard constraints throughout: **existing CLI flags stay intact** and **output schema remains byte-for-byte compatible**.

## Phase 1: Baseline, Contracts, and Safety Rails

- Define and freeze the current job contract:
  - CLI behavior (flags, defaults, exit codes, help text)
  - output schema (column names, types, ordering, null handling, formatting)
  - operational behavior (runtime window, memory profile, retry/manual rerun steps)
- Capture representative datasets (small, medium, production-like slices) plus a “golden output” snapshot from current pandas job.
- Add a regression harness that runs old vs new pipeline and compares schema + deterministic output fields.

**Acceptance criteria**
- Existing CLI contract documented and test-covered (including `--help` output and invalid-arg behavior).
- Golden outputs generated and versioned for at least 3 data scales.
- Comparator reports zero schema drift on baseline runs.

**Risks**
- Hidden implicit behavior in current script (dtype coercions, timezone parsing, row ordering).
- Golden data not representative of production edge cases.
- Mitigation: include malformed rows, large cardinality keys, and skewed partitions in baseline fixtures.

---

## Phase 2: Pipeline Skeleton with CLI Compatibility Layer

- Introduce a staged pipeline structure (extract -> transform -> load) without changing business logic yet.
- Build a compatibility entrypoint that accepts **exact existing flags** and maps them to internal config.
- Preserve current single-node execution path initially for safe parity checks.

**Acceptance criteria**
- Users invoke the new entrypoint with existing flags and get equivalent behavior.
- End-to-end run completes on small/medium fixtures with identical output schema and row counts.
- No required changes to downstream consumers.

**Risks**
- CLI parser differences (defaults, required flags, boolean semantics).
- Accidental behavior changes from refactor-only work.
- Mitigation: contract tests for CLI and snapshot tests for outputs per flag combination.

---

## Phase 3: Chunked Processing Engine (50GB-ready)

- Replace whole-file DataFrame loads with chunked ingestion (`read_csv(..., chunksize=...)` or equivalent reader abstraction).
- Refactor transforms into chunk-safe operations:
  - stateless row-wise ops run per chunk
  - global aggregations use two-pass or incremental reducers
- Add configurable chunk size and bounded memory settings (internal only; do not break CLI surface).

**Acceptance criteria**
- Peak memory remains within target envelope under 50GB input (define explicit max, e.g., <70% node RAM).
- Full 50GB test completes without OOM.
- Output schema and deterministic fields remain identical to golden contract.

**Risks**
- Non-associative transforms causing drift when computed per chunk.
- Row order instability across chunk boundaries.
- Mitigation: explicit ordering keys/final sort step where contract requires determinism; redesign aggregates as associative reducers.

---

## Phase 4: Resumability and Idempotency

- Add checkpointing at chunk/batch boundaries (processed offsets/partitions, transform stage markers).
- Write outputs via atomic temp files + commit/rename pattern.
- Ensure reruns are idempotent (same inputs + flags => same output; partial failures recover safely).
- Add a resume strategy: automatic from latest valid checkpoint, with clear logging.

**Acceptance criteria**
- Forced failure mid-run can resume and finish without duplicate/missing records.
- Re-running a completed job does not alter final outputs unexpectedly.
- Checkpoint metadata survives process restarts and is validated on startup.

**Risks**
- Corrupted or stale checkpoints causing silent data loss/duplication.
- Partial writes leaving inconsistent artifacts.
- Mitigation: checkpoint validation checksum, atomic write protocol, and safe fallback to restart-from-known-good boundary.

---

## Phase 5: Performance Tuning and Operational Hardening

- Tune chunk size, parser options, and parallelism (if safe) for nightly SLA.
- Add observability: per-stage timings, rows/sec, bad-row counts, memory watermark, resume events.
- Define backpressure/error policies for malformed records (skip/quarantine/fail) consistent with existing behavior.
- Build runbook for on-call and rollback to legacy path.

**Acceptance criteria**
- Nightly SLA met on 50GB workload (define target runtime explicitly).
- Structured logs/metrics expose progress and bottlenecks per stage.
- Operational runbook validated in at least one fire-drill.

**Risks**
- Throughput regressions from excessive checkpoint/log overhead.
- New bottlenecks in disk I/O or serialization.
- Mitigation: benchmark matrix (chunk size x compression x I/O path), profile-guided optimization, and log sampling.

---

## Phase 6: Parallel Shadow Runs and Cutover

- Run old and new jobs in parallel for N nights (recommended 7-14), compare outputs and runtime stats.
- Track deltas and classify: expected (non-deterministic non-contract fields) vs defects.
- Cut over only after sustained parity and SLA success; keep rollback switch for one release cycle.

**Acceptance criteria**
- Zero schema drift across shadow window.
- Data parity within agreed tolerance for all contract-significant fields (ideally exact match).
- Documented go/no-go decision and tested rollback path.

**Risks**
- Late-discovered edge cases only seen on specific dates/data distributions.
- False confidence from weak comparison metrics.
- Mitigation: strict comparators, daily diff reports, and explicit sign-off checklist from data consumers.

---

## Cross-phase guardrails (must hold throughout)

- **CLI invariant:** no breaking changes to existing flags or semantics.
- **Schema invariant:** no output schema change (names/types/order/null semantics).
- **Verification invariant:** every phase includes old-vs-new parity tests before promotion.

If helpful, I can turn this into a week-by-week execution timeline with owners and a test matrix (functional, failure-injection, and performance).