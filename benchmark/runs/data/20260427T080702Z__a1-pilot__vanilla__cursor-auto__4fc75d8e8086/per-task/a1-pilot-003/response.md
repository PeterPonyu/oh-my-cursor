Most likely causes (highest base-rate first), with the fastest single check for each:

1. **Pytest is slow/hanging during test collection (import-time side effects).**  
   Common when a module does network calls, DB connections, heavy startup, or blocking code at import time.
   - **Fast diagnostic:** `pytest --collect-only -vv -s`

2. **A plugin is blocking startup/collection (autoloaded third-party plugin conflict).**  
   Very common in environments with many installed plugins (`pytest-*` packages).
   - **Fast diagnostic:** `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest -vv -s`

3. **A test (often async/thread/process) deadlocks or waits forever.**  
   Typical with unjoined threads, hanging fixtures, event-loop misuse, or subprocess waits.
   - **Fast diagnostic:** `pytest -vv -s --maxfail=1 --durations=10`

If you want, I can also give a 60-second triage sequence to run these in order and interpret results quickly.