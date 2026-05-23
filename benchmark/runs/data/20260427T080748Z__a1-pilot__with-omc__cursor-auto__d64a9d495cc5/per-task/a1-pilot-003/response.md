Most likely causes (ranked by base rate) and the fastest one-liner to check each:

1. **Pytest is collecting/running way too much (wrong rootdir, huge tree, network mounts, or `testpaths` misconfig)**
   - Fast diagnostic:  
     ```bash
     pytest --collect-only -q
     ```
   - If this itself appears to “hang”, collection scope is the problem.

2. **A fixture blocks before test output (session/module fixture waiting on DB, HTTP, Docker, subprocess, etc.)**
   - Fast diagnostic:  
     ```bash
     pytest -vv -s --setup-show -x
     ```
   - This shows fixture setup progression so you can see the exact fixture where it stops.

3. **A plugin/import side effect deadlocks or stalls startup (e.g., `conftest.py`, `pytest.ini` plugins, coverage, asyncio/gevent interactions)**
   - Fast diagnostic:  
     ```bash
     PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest -q
     ```
   - If this runs, re-enable plugins incrementally to find the blocker.

If you want, I can give you a **30-second triage sequence** that combines these into the minimum number of runs.