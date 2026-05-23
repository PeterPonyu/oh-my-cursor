Restated failure: a Python worker that should run steadily instead shows near-linear RSS growth of about **50 MB/hour**, eventually hitting OOM at around **18 hours**, which strongly suggests a persistent memory-retention pattern rather than a short-lived spike.

| Rank | Hypothesis | Confidence | Cheapest discriminating probe | Probe would falsify |
|---|---|---:|---|---|
| 1 | **Application-level retention leak** (objects accumulating in Python space: caches, queues, global dicts, unbounded lists, task metadata) | **0.62** | Enable `tracemalloc` with periodic snapshots (e.g., every 10–15 min) and compare top growing traceback groups; also log `gc.get_count()` and object counts for key container types | Falsifies **H1** if RSS rises while traced Python allocations remain flat and no growing traceback/object family appears |
| 2 | **Native/extension allocator growth** (NumPy/Pandas/PyTorch/C libs, compression libs, DB drivers, or fragmentation in libc arenas) | **0.25** | Compare **RSS vs Python heap**: run `memray`/`heaptrack` sample window or at least log `tracemalloc` total alongside RSS; if possible test once with `MALLOC_ARENA_MAX=2` | Falsifies **H2** if Python-traced allocations track RSS growth closely (i.e., growth is clearly in Python objects, not native heap/arenas) |
| 3 | **Resource buffering/backpressure artifact** (producer > consumer, message prefetch too high, buffered responses/chunks retained, delayed ACK/retry queues) | **0.13** | Temporarily cap in-flight work (prefetch/concurrency/batch size) and log queue depth + in-flight count + RSS slope for 1–2 hours | Falsifies **H3** if RSS slope stays ~50 MB/hour despite low/flat in-flight depth and reduced buffering settings |

Quick interpretation rule during probes:
- **RSS up + tracemalloc up** → favors **H1**.  
- **RSS up + tracemalloc flat** → favors **H2**.  
- **RSS slope drops when in-flight/buffering is capped** → favors **H3**.