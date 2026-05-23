Most likely causes, ranked by base rate for “`pytest` hangs forever with no output/error”:

- **1) Test collection imports execute blocking code (highest base rate)**
  - **Confidence:** High
  - **Why common:** `pytest` imports test modules and app modules during collection; any import-time side effect (network call, DB connect, waiting on lock, infinite loop, heavy model load) can stall before first test output.
  - **Cheapest diagnostic command:**  
    - `pytest --collect-only -vv -s`
  - **Discriminate vs next-best alternative:**  
    - If it hangs during collection and you never reach “collected X items”, this strongly favors import-time blocking.  
    - Next-best (plugin deadlock) often still shows plugin/session startup lines, and disabling plugins changes behavior quickly.

- **2) Problematic plugin or `conftest.py` fixture hook blocking startup**
  - **Confidence:** Medium-High
  - **Why common:** Third-party plugins (`xdist`, `asyncio`, coverage, env loaders) or autouse/session fixtures in `conftest.py` can block before tests run.
  - **Cheapest diagnostic command:**  
    - `pytest -p no:all -q`  
    (then re-enable minimal builtins/plugins incrementally)
  - **Discriminate vs next-best alternative:**  
    - If disabling plugins unblocks immediately, root cause is plugin/hook/fixture path.  
    - If still hangs with plugins disabled, suspect import-time block or external resource wait in project code.

- **3) Waiting on external dependency (DB/service/socket/file lock) with no timeout**
  - **Confidence:** Medium
  - **Why common:** Tests or setup code call real services (localhost ports, Docker DB, cloud APIs) and block silently when endpoint is unavailable.
  - **Cheapest diagnostic command:**  
    - `pytest -vv -s --maxfail=1`
  - **Discriminate vs next-best alternative:**  
    - If verbose output shows it gets past collection and hangs on a specific test/fixture boundary, external wait is likely.  
    - If it never reaches first test node, import-time or plugin startup is more likely.

Quick triage order (fastest signal):  
1) `pytest --collect-only -vv -s`  
2) `pytest -p no:all -q`  
3) `pytest -vv -s --maxfail=1`  

If you want, I can give you a 5-command “binary search” flow to localize the exact file/fixture in under 10 minutes.