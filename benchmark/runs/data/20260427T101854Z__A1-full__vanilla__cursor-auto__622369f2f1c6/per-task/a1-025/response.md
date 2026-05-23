Most likely causes for **“`pytest` hangs forever with no output/error”**, ranked by base rate:

1. **A test (or fixture/import) is blocking on I/O or waiting indefinitely**
- **Why high base rate:** Very common with network calls, `subprocess` waits, DB connections, `input()`, sleeps/retries, or deadlocked locks/events.
- **Confidence:** **High**
- **Cheapest diagnostic command:**  
  - `pytest -vv -s --setup-show --maxfail=1`
- **How to distinguish from #2:**  
  - If you see collection/setup progress and then it stops at a specific test/fixture, this is likely test/runtime blocking.  
  - If it never gets past “collecting …”, #2 is more likely.

2. **Hang during test collection due to import-time side effects**
- **Why high base rate:** Common when module import starts app servers, opens sockets, does heavy initialization, or runs top-level code with waits.
- **Confidence:** **Medium-High**
- **Cheapest diagnostic command:**  
  - `pytest --collect-only -vv`
- **How to distinguish from #3:**  
  - If `--collect-only` itself hangs, it’s usually import/collection side effects.  
  - If collection finishes fast but normal run hangs later, think plugins/concurrency (#3) or blocking test code (#1).

3. **Pytest plugin/concurrency interaction deadlock (xdist, asyncio, coverage, custom plugins)**
- **Why medium base rate:** Less common than #1/#2, but very frequent in larger stacks using many plugins.
- **Confidence:** **Medium**
- **Cheapest diagnostic command:**  
  - `pytest -p no:all -p pytest_cov` *(or simply start with `pytest -p no:all` to test bare core)*  
  - Practical simpler first cut: `pytest -q -p no:xdist -p no:asyncio`
- **How to distinguish from #1:**  
  - If disabling plugins makes hang disappear without changing tests, plugin interaction is likely.  
  - If hang persists even with minimal plugins, it’s more likely blocking test code/fixtures (#1).

Quick triage order I’d run:
1) `pytest --collect-only -vv`  
2) `pytest -vv -s --setup-show --maxfail=1`  
3) `pytest -q -p no:xdist -p no:asyncio` (or broader plugin disable)