I’ll run a quick structured investigation pass first so I can give you ranked, evidence-based hypotheses with clear symptom vs root-cause separation.I’m checking what local artifacts exist (queries/jobs/config) so the hypotheses are grounded rather than generic.**Restated failure:** For the last 4 days, the nightly aggregation output is consistently about **1.3% lower** than source row count; prior to that, counts matched exactly.

**Symptom vs root cause (explicit):**
- **Symptom (observed):** a stable ~1.3% row-count deficit in aggregated output over 4 consecutive runs.
- **Root cause (not yet proven):** the specific mechanism dropping rows (filtering, join behavior, ingestion timing, dedup logic, etc.) is still unknown.

### Ranked hypotheses
1. **A new/changed filter predicate started excluding a small, consistent segment**  
   - **Confidence:** Medium-High  
   - **Why ranked #1:** The drop is stable (not random), started at a clear time boundary, and is proportional (fits a deterministic exclusion rule).

2. **Join cardinality changed (e.g., inner join now missing dimension matches), causing silent row loss**  
   - **Confidence:** Medium  
   - **Why ranked #2:** Inner-join mismatch often creates persistent percentage loss when key coverage shifts; timing pattern also fits schema/dimension update windows.

3. **Late-arriving source data shifted past the aggregation cutoff window**  
   - **Confidence:** Medium-Low  
   - **Why ranked #3:** Timing-related misses can produce deficits, but a fixed 1.3% across 4 days is less typical unless upstream latency profile changed sharply and consistently.

### Smallest next action
Run a **single-day anti-join probe** between source and aggregation input boundary for the first failing day:
- Materialize source primary keys at aggregation cutoff.
- Anti-join against keys that made it into the aggregation stage.
- Return top loss buckets by reason columns (partition/date, source system, status flags, join key nullability).

This is the smallest discriminating step because it immediately tells you whether loss is from **predicate exclusion**, **join miss**, or **time-window miss** without changing code.