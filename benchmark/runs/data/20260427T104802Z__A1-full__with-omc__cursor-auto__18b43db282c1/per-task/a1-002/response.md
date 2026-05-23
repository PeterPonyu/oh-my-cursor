1. **Create a compatibility baseline before changing component types**  
   - **File scope:** `src/components/Header.*`, `src/components/Sidebar.*`, `src/components/MainView.*`, shared parent container files (e.g., `src/App.*`), related tests/stories.  
   - Capture current behavior (props, state transitions, lifecycle side effects, render output), and add/refresh focused tests around those contracts so refactor safety is measurable.  
   - **Rollback note:** If anything regresses later, revert to this baseline commit and keep the new tests as guardrails for the next attempt.

2. **Refactor leaf/presentational component first (`Header`)**  
   - **File scope:** `src/components/Header.*` (+ `Header.test.*` / story file if present).  
   - Convert class to function: constructor state -> `useState`, class methods -> inline handlers or `useCallback` where needed, lifecycle usage (`componentDidMount/Update/WillUnmount`) -> `useEffect`. Keep public props API unchanged to avoid ripple changes.  
   - **Rollback note:** If integration breaks, restore only `Header.*` to class version while keeping parent/peer components untouched.

3. **Refactor navigation component with side effects (`Sidebar`)**  
   - **File scope:** `src/components/Sidebar.*`, any sidebar-specific hooks/util files, tests/stories.  
   - Move stateful logic to hooks (`useState`, `useMemo`, `useEffect`), and extract repeated effect logic into a custom hook if Sidebar has subscriptions/listeners. Ensure cleanup logic from `componentWillUnmount` is preserved in effect cleanup returns.  
   - **Rollback note:** Revert `Sidebar.*` (and any newly introduced sidebar hook file) as a unit if event handling or cleanup behavior becomes unstable.

4. **Refactor core container (`MainView`) and stabilize data flow**  
   - **File scope:** `src/components/MainView.*`, parent wiring files (e.g., `src/App.*`), shared context/store connectors, tests.  
   - Convert class state orchestration to hooks (`useReducer` recommended if state transitions are complex), replace lifecycle-driven fetch/sync logic with well-scoped effects, and preserve child prop contracts for `Header`/`Sidebar`.  
   - **Rollback note:** If state synchronization issues appear, roll back `MainView` conversion only and keep already-converted `Header`/`Sidebar` functional.

5. **Consolidate and harden: remove class-era patterns, verify, and stage rollout**  
   - **File scope:** all touched component files, shared utils/hooks, lint config/tests if needed.  
   - Remove dead class helpers (`bind`, instance fields, deprecated lifecycle polyfills), run full test + lint + smoke pass, and optionally ship behind a feature flag/canary if risk is high. Document migration notes for future components.  
   - **Rollback note:** Keep each component refactor in separate commits; if post-merge issues appear, selectively revert the offending component commit instead of reverting the whole tree.