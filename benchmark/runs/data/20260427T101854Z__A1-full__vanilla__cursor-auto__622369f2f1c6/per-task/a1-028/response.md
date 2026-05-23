I’ll do a focused failure analysis: restate the issue, rank likely causes, and give the cheapest probe that cleanly discriminates each hypothesis. I’m first pulling the analysis skill guidance to structure this correctly.### Restated Failure

A long-lived Python worker shows near-linear RSS growth (~50 MB/hour) and eventually gets OOM-killed after ~18 hours, which strongly suggests a memory-retention issue rather than a short spike.

### Ranked Hypotheses

| Rank | Hypothesis | Confidence | Why it fits |
|---|---|---:|---|
| 1 | **Python object retention in process memory** (unbounded caches, global collections, queued work objects, lingering references) | **High** | Linear growth over many hours is classic for app-level objects staying reachable. |
| 2 | **Native-memory leak outside Python heap** (C extensions: numpy/pandas/PIL/lxml/grpc/torch, etc.) | **Medium** | RSS can rise while Python heap appears stable if allocations happen in native code. |
| 3 | **Allocator/fragmentation effect** (glibc arenas, allocator not returning pages, bursty object size churn) | **Low-Medium** | Can inflate RSS over time without a true “leak,” but 50 MB/hour sustained is less typical unless allocation pattern is extreme. |

### Cheapest Discriminating Probe per Hypothesis

| Hypothesis tested | Cheapest probe | What result would falsify it |
|---|---|---|
| 1) Python object retention | Enable `tracemalloc` snapshots every 10–15 min and compare top growing traces; also log `gc.get_objects()` count trend by major type | **Falsified if** Python-tracked allocations stay roughly flat while RSS keeps climbing significantly |
| 2) Native-memory leak | In parallel with above, log RSS (`psutil.Process().memory_info().rss`) and Python heap size (`tracemalloc` total or `pympler/asizeof` sample) | **Falsified if** RSS growth closely matches Python heap growth (i.e., not “native-only” growth) |
| 3) Fragmentation/allocator behavior | Run once with `PYTHONMALLOC=malloc` and once with `MALLOC_ARENA_MAX=1` (same workload), compare RSS slope | **Falsified if** RSS slope is unchanged across allocator settings and still tracks specific allocation sites/types |

### Evidence vs Inference

- **Evidence:** Only the symptom you provided (steady RSS climb, long runtime, OOM at ~18h).
- **Inference:** Ranking is based on typical leak signatures for that pattern, not code-specific proof.
- **Unknown:** Exact worker code path, dependencies, and whether growth is tied to workload volume/time. These probes are designed to resolve that quickly with minimal instrumentation.