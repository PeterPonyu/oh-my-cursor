I’ll produce a concrete migration plan with phases, cycle-risk analysis, verification commands, rollback, and clear non-goals. I’m first pulling the planning skill guidance so the structure is robust and implementation-ready.## Extraction Plan: Shared `payments` Package

### Assumptions
- Monorepo uses npm-compatible workspaces (`npm`, `pnpm`, or `yarn`).
- Four services currently import shared `payments` logic directly via relative paths or duplicated code.
- Internal registry is available (GitHub Packages, Verdaccio, Artifactory, etc.).

### Ordered Phases

- **Phase 0 — Baseline + Inventory**
  - Identify all `payments` entry points, transitive deps, and service-specific forks.
  - Freeze current behavior with smoke/integration tests in each service.
  - Define package API surface (`public exports only`) and target semver policy (`1.0.0` initial).
  - **Verification commands**
    - `npm -ws test`
    - `npm -ws run lint`
    - `npm -ws run build`
    - `rg "from ['\"].*payments|require\(.+payments" .`

- **Phase 1 — API Contract and Boundary Definition**
  - Create `packages/payments` with explicit exports (`index.ts`, subpath exports if needed).
  - Move only reusable domain logic first; keep infra adapters (DB, queues, HTTP clients) out.
  - Add ADR documenting what belongs inside vs outside the package.
  - **Verification commands**
    - `npm -w packages/payments run build`
    - `npm -w packages/payments test`
    - `npm -w packages/payments run lint`
    - `npm -w packages/payments pack --dry-run`

- **Phase 2 — Dependency Cycle Elimination (Pre-Migration Hardening)**
  - Detect and break any cycles between `payments` and service packages.
  - Invert dependencies: define interfaces in `payments`, implement adapters in services.
  - Remove imports from `payments` to service-local modules/config.
  - **Verification commands**
    - `npx madge packages/payments --extensions ts --circular`
    - `npx depcruise --config .dependency-cruiser.js packages/payments`
    - `npm -w packages/payments run typecheck`

- **Phase 3 — Local Consumer Migration (Workspace Mode)**
  - Migrate Service 1 → Service 4 one at a time to workspace reference (`workspace:*` or local path).
  - Keep feature flags or adapter shims to reduce blast radius.
  - Ensure no service imports private internals from `payments`.
  - **Verification commands (per service)**
    - `npm -w services/<service-name> run build`
    - `npm -w services/<service-name> test`
    - `npm -w services/<service-name> run lint`
    - `npm -w services/<service-name> run test:integration`

- **Phase 4 — Publish Pipeline + Versioning**
  - Configure package publishing (`private` internal package, scoped name like `@org/payments`).
  - Enforce semantic-release/changesets workflow and changelog generation.
  - Publish `1.0.0` once all 4 services pass against workspace package.
  - **Verification commands**
    - `npm -w packages/payments version --no-git-tag-version 1.0.0` (or changeset flow)
    - `npm -w packages/payments pack`
    - `npm publish --workspace packages/payments --tag internal --dry-run`
    - `npm view @org/payments versions --registry <internal-registry>`

- **Phase 5 — External Consumption Cutover**
  - Replace workspace refs in each service with registry version (`@org/payments@^1.0.0`).
  - Run deployments incrementally (one service at a time).
  - Monitor payment success rate, latency, and error codes.
  - **Verification commands (per service)**
    - `npm -w services/<service-name> install @org/payments@^1.0.0`
    - `npm -w services/<service-name> run build && npm -w services/<service-name> test`
    - `npm -w services/<service-name> run test:integration`
    - `npm -w services/<service-name> run test:e2e` (if available)

- **Phase 6 — Cleanup + Enforcement**
  - Remove old shared code paths and duplication.
  - Add lint/dependency rules to block forbidden cross-imports.
  - Add CI guard for circular deps and API extractor/contract checks.
  - **Verification commands**
    - `rg "old/payments/path|legacyPayments" services/ packages/`
    - `npx madge packages/payments --circular`
    - `npm -ws run ci` (or full pipeline command)

---

## Dependency-Cycle Risk Analysis

- **Risk 1: `payments` imports service code (direct cycle)**
  - Example: `packages/payments -> services/a/config -> packages/payments`.
  - **Mitigation:** Move contracts/types into `payments`; move implementations to service adapters.

- **Risk 2: Hidden shared util cycles**
  - Example: `payments -> shared-utils -> payments`.
  - **Mitigation:** Extract neutral `core-utils` package or duplicate tiny pure helpers until stabilized.

- **Risk 3: Runtime config leakage**
  - Package reads env/config shape specific to one service.
  - **Mitigation:** Use explicit config object passed at init; validate via schema at boundary.

- **Risk 4: Test-only cycles masking prod issues**
  - Dev/test dependencies can conceal import cycles not visible in production path.
  - **Mitigation:** Run cycle tools on runtime graph and test graph separately in CI.

- **Risk 5: Version skew across 4 services**
  - Different services pin incompatible `payments` versions.
  - **Mitigation:** Define support window (N and N-1), add compatibility tests, and release notes with breaking-change checklist.

---

## Rollback Strategy

- **Package rollback**
  - Deprecate bad version: `npm deprecate @org/payments@x.y.z "regression: use x.y.(z-1)"`.
  - Promote previous known-good tag and update docs/changelog.

- **Service rollback**
  - Revert service dependency to prior version (`npm i @org/payments@<last-good>`), redeploy per service.
  - Keep rollback PR template prepared for each of the 4 services.

- **Operational rollback controls**
  - Keep runtime feature flag to switch to legacy payment path for one release window.
  - Canary each service; stop rollout if payment error rate or latency breaches SLO.

- **Data safety**
  - No schema/data mutation inside package release.
  - If schema changes are unavoidable later, ship them as separate, reversible migrations.

---

## Explicit Non-Goals

- Rewriting payment domain behavior or business rules during extraction.
- Consolidating all service-specific payment adapters into the shared package.
- Changing database schema, event contracts, or external provider semantics in this effort.
- Solving unrelated monorepo architecture debt outside payment module boundaries.
- Introducing cross-service runtime coupling (shared runtime state, remote calls between services).

---

If useful, I can turn this into a ready-to-run checklist format (`owner`, `ETA`, `exit criteria`) for your team’s tracking tool.