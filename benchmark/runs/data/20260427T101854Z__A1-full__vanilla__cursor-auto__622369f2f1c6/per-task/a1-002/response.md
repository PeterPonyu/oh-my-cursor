1. **Stabilize behavior before refactor**  
   - **What to do:** Capture current behavior (props flow, lifecycle usage, state transitions, side effects) for `Header`, `Sidebar`, and `MainView`; add/update smoke tests around rendering and key interactions.  
   - **File scope:**  
     - `src/components/Header.*`  
     - `src/components/Sidebar.*`  
     - `src/components/MainView.*`  
     - Related tests: `src/components/__tests__/*` (or existing test locations)  
   - **Rollback note:** If baseline tests fail or behavior is unclear, stop and revert only new test/docs changes for this step; do not proceed until baseline is green.

2. **Refactor leaf component first (`Header`) to functional + hooks**  
   - **What to do:** Convert `Header` class to function component, replace `this.state` with `useState`, lifecycle methods with `useEffect`, and class handlers with inline/`useCallback` handlers as needed. Keep external props API unchanged.  
   - **File scope:**  
     - `src/components/Header.*`  
     - Any `Header`-specific styles/types file (e.g., `Header.css`, `Header.types.ts`)  
   - **Rollback note:** If regressions appear, restore previous `Header` class implementation from VCS and keep parent components unchanged to isolate risk.

3. **Refactor sibling component (`Sidebar`) with compatibility checks**  
   - **What to do:** Convert `Sidebar` similarly, preserving prop contracts and emitted callbacks; verify interactions with existing `MainView` class component still work.  
   - **File scope:**  
     - `src/components/Sidebar.*`  
     - `Sidebar` test files and any shared utility touched by sidebar logic  
   - **Rollback note:** Revert only `Sidebar`-related commits/files if integration breaks; `Header` functional refactor can remain if stable.

4. **Refactor container/root (`MainView`) and align data flow**  
   - **What to do:** Convert `MainView` class to function component; migrate lifecycle orchestration to `useEffect`, local state to `useState`/`useReducer`, and derived values to `useMemo` where useful. Ensure `Header` and `Sidebar` props/callback wiring stays consistent.  
   - **File scope:**  
     - `src/components/MainView.*`  
     - Any local context/store wiring consumed directly by `MainView`  
   - **Rollback note:** If the tree-level behavior regresses, rollback `MainView` only and keep `Header`/`Sidebar` functional versions; retry with smaller internal slices.

5. **Cleanup, optimization, and safety net hardening**  
   - **What to do:** Remove obsolete class artifacts (bound methods, dead lifecycle helpers), tighten hook dependency arrays, run lint/tests, and add regression tests for cross-component flows (`Header` + `Sidebar` + `MainView`).  
   - **File scope:**  
     - All three component files  
     - Shared utils/hooks introduced (e.g., `src/hooks/*`)  
     - Test files covering integrated tree behavior  
   - **Rollback note:** If performance or behavior worsens, revert cleanup/optimization changes only (keep functional migration), then reintroduce improvements incrementally behind passing tests.