I’ll treat this as a root-cause investigation and quickly run the analysis workflow, then return ranked hypotheses with the cheapest probe for each and clear falsification criteria.### Restated Failure

A Python worker process appears to leak memory in production: its RSS increases steadily at about **50 MB/hour** and eventually gets **OOM-killed after ~18 hours**.

### Ranked Hypotheses

| Rank | Hypothesis | Confidence | Why it’s plausible |
|---|---|---:|---|
| 1 | **Application-level object retention** (unbounded in-memory cache/list/dict, queued results, or per-task state never released) | **High** | Linear growth over many hours is the classic shape of retained Python objects tied to workload. |
| 2 | **C-extension / native memory leak** (numpy/pandas/pyarrow/requests/OpenSSL/etc. or custom C module) | **Medium** | RSS can rise while Python GC looks normal if native allocations aren’t tracked in Python heap metrics. |
| 3 | **Allocator fragmentation / arena behavior** (memory not returned to OS despite object churn) | **Medium-Low** | Can produce rising RSS without true logical leak, especially with mixed allocation sizes and long-lived worker processes. |

### Cheapest Discriminating Probe Per Hypothesis

| Hypothesis | Cheapest probe | What it would falsify |
|---|---|---|
| 1. Python object retention | Turn on `tracemalloc` snapshot every N minutes and compare top growing allocation traces; also log `len()` of major caches/queues/maps | If RSS rises but `tracemalloc` total and object-retaining callsites stay flat, this **falsifies H1** and points away from Python-heap retention |
| 2. Native/C-extension leak | Correlate RSS with Python heap: log RSS (e.g., `psutil`) vs `tracemalloc` bytes over time | If RSS and Python heap grow together with same slope, this weakens/falsifies **H2**; if RSS grows while Python heap is flat, it strongly supports H2 |
| 3. Fragmentation/allocator effects | Run one canary with `PYTHONMALLOC=malloc` (or jemalloc preload) and compare RSS slope under similar load | If slope remains ~50 MB/h across allocators, **H3** is likely falsified; if slope drops sharply, H3 is supported |

### Evidence vs Inference

- **Evidence (from your report):** long runtime, near-linear RSS growth, eventual OOM.
- **Inference:** linear monotonic growth most strongly suggests retention/leak behavior, with Python-heap retention most common; mismatch between RSS and Python heap is key discriminator for native leak/fragmentation.

If you want, I can give a minimal drop-in instrumentation snippet (RSS + tracemalloc delta + top alloc sites) that you can run for one shift and classify these three quickly.