Most likely causes by **base rate** for “`pytest` hangs forever with no output/error”:

1. **Collection/import side effect is blocking (network call, DB init, subprocess, sleep)**
   - **Confidence:** High (~55%)
   - **Cheapest diagnostic command:**  
     `pytest --collect-only -vv -s`
   - **How to discriminate from #2:**  
     If it hangs during collection (before “collected X items”), this is usually import-time/collection code.  
     If collection completes and hang starts only after tests begin, #2 is more likely.

2. **A fixture or setup is waiting indefinitely (session/module fixture, teardown deadlock, external service wait)**
   - **Confidence:** Medium-High (~30%)
   - **Cheapest diagnostic command:**  
     `pytest -vv -s --setup-show --maxfail=1`
   - **How to discriminate from #3:**  
     If output stops at a specific fixture/setup step, it’s fixture/setup logic.  
     If the run only hangs with parallelization/plugins enabled (and not in plain mode), #3 is more likely.

3. **Plugin/parallelization interaction deadlock (e.g., `xdist`, asyncio plugin mode, coverage plugin hooks)**
   - **Confidence:** Medium (~15%)
   - **Cheapest diagnostic command:**  
     `pytest -vv -s -p no:all`
   - **How to discriminate from #1:**  
     If `-p no:all` runs (or at least produces progress) but normal run hangs, plugin interference is likely.  
     If both hang at collection/import, revert to #1 (import-time blocking).

Quick triage sequence (fastest): run `--collect-only`, then `--setup-show`, then `-p no:all`. This usually isolates the class of failure in a few minutes.