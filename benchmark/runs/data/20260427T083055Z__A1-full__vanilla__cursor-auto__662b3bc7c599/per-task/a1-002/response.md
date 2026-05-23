I’ll draft a concrete 5-step migration plan with file-by-file scope and rollback notes. First I’m quickly checking the planning skill guidance so I can format it the way you asked.1. **Stabilize behavior before refactor (baseline + safety net)**  
   - **File scope:** `Header.*`, `Sidebar.*`, `MainView.*`, parent composition file (often `App.*` or `Layout.*`), related tests (`*.test.*`), and snapshot files if used.  
   - Capture current props/state contracts, lifecycle usage (`componentDidMount`, `componentDidUpdate`, `componentWillUnmount`), and key interactions; add/refresh tests so behavior is locked before conversion.  
   - **Rollback note:** If later steps regress behavior, reset to this baseline commit and rely on these tests to identify exactly what changed.

2. **Convert leaf component first: `Header` (class -> function + hooks)**  
   - **File scope:** `Header.*` plus any `Header`-specific test/style/helper files.  
   - Rewrite `Header` as a function component; map lifecycle logic to hooks (`useEffect`), internal state to `useState`/`useReducer`, and instance methods to local functions; keep prop API unchanged.  
   - **Rollback note:** If issues appear, restore only `Header.*` to class version while keeping other components untouched.

3. **Convert `Sidebar`, including event/subscription cleanup**  
   - **File scope:** `Sidebar.*`, sidebar child items if tightly coupled, and sidebar tests.  
   - Refactor class state and handlers to hooks; ensure any listeners/timers/subscriptions are moved into `useEffect` with cleanup return functions; preserve public props and emitted callbacks.  
   - **Rollback note:** Revert `Sidebar.*` independently if navigation/filter behavior breaks, without undoing `Header` progress.

4. **Convert `MainView` and shared state flow across the tree**  
   - **File scope:** `MainView.*`, shared state utilities/contexts, parent container (`App.*`/`Layout.*`), and integration tests that cover Header/Sidebar/MainView interaction.  
   - Refactor `MainView`; lift or centralize shared state via hooks/context where class instance coupling existed; replace class refs/imperative patterns with `useRef`, `useMemo`, and `useCallback` as needed to avoid rerender churn.  
   - **Rollback note:** If cross-component data flow regresses, roll back this step only and keep `Header`/`Sidebar` functional conversions in place.

5. **Hardening pass: cleanup, performance parity, and final cutover**  
   - **File scope:** all touched component files, parent composition file, test suite, lint/type configs only if needed.  
   - Remove dead class-era code, validate dependency arrays, run full tests, and compare render behavior/perf (especially for `MainView` hot paths); finalize migration docs/changelog for team handoff.  
   - **Rollback note:** Keep this as a separate final commit so you can revert cleanup/perf tweaks without undoing the core functional-component migration.