1. **Refactor `Header` first (smallest blast radius)**
   - **File scope:** `src/components/Header.jsx` (or `.tsx`), plus any direct tests/stories like `Header.test.*`, `Header.stories.*`.
   - **Action:** Convert `class Header extends React.Component` to `function Header(props)`, replace lifecycle/state usage with `useState`, `useEffect`, `useMemo`, `useCallback` only where needed, keep props API unchanged.
   - **Rollback note:** Keep the old class version in a short-lived backup branch/commit (`refactor/header-hook-migration`) so you can revert only `Header` if regressions appear, without touching `Sidebar`/`MainView`.

2. **Refactor `Sidebar` with compatibility boundaries**
   - **File scope:** `src/components/Sidebar.jsx` (or `.tsx`), child items like `SidebarItem.*`, and Sidebar-specific styles/tests.
   - **Action:** Convert `Sidebar` to functional form, preserve emitted callbacks and prop names, and isolate side effects (subscriptions/listeners) into `useEffect` cleanup blocks.
   - **Rollback note:** If navigation or selection state breaks, revert just `Sidebar` files to the previous commit while leaving `Header` functional; this keeps migration incremental and low-risk.

3. **Refactor `MainView` and data/effect orchestration**
   - **File scope:** `src/components/MainView.jsx` (or `.tsx`) and closely coupled view modules/hooks/services used directly by `MainView`.
   - **Action:** Replace class lifecycle flow (`componentDidMount/DidUpdate/WillUnmount`) with explicit `useEffect` blocks split by concern (fetching, subscriptions, derived state), and move reusable logic into custom hooks if duplicated.
   - **Rollback note:** If render timing or fetch behavior changes unexpectedly, revert `MainView` conversion only; keep `Header`/`Sidebar` migrations intact to avoid rework.

4. **Unify shared patterns and lift reusable hooks**
   - **File scope:** New hooks folder (for example `src/hooks/`) plus touched components: `Header`, `Sidebar`, `MainView`.
   - **Action:** Extract repeated logic (window listeners, async loading, memoized handlers) into shared hooks (`useX`) and remove class-era patterns (instance methods, `this` binding assumptions).
   - **Rollback note:** If abstraction introduces bugs, revert only the hook extraction commit and keep each component functional with local hook logic (safe fallback with minimal architecture change).

5. **Stabilize with tests, typing, and cleanup**
   - **File scope:** Component tests/integration tests (`src/components/**/*.test.*`), type defs/interfaces, and any parent composition file wiring `Header + Sidebar + MainView`.
   - **Action:** Update tests for functional behavior, verify effect cleanup and render parity, remove dead class utilities, and run lint/test/build gates before merge.
   - **Rollback note:** If failures are widespread near release, rollback by commit boundary to the last known-good mixed state (some class, some functional), then re-apply migrations one component at a time behind feature flags if needed.