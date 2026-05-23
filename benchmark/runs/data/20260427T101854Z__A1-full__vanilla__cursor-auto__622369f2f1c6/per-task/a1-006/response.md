I’ll draft a concrete migration plan with phases, risks, verification, rollback, and non-goals. First I’m quickly checking the planning skill guidance so the structure matches what you asked for.## Extraction Plan: Shared `payments` Package

### Requirements Summary
- Extract shared `payments` logic from a monorepo into a versioned internal npm package.
- Migrate 4 consuming services with minimal disruption.
- Prevent dependency cycles and release instability.
- Keep rollout reversible at every stage.

### Explicit Non-Goals
- Rewriting payment business logic or changing payment provider behavior.
- Standardizing all service architectures or build systems.
- Introducing cross-service runtime RPC as part of this migration.
- Solving unrelated tech debt in the existing payment code.
- Migrating to public npm (scope remains internal/private registry).

---

## Ordered Phases

### Phase 0 — Baseline and Inventory
**Objective:** Build a precise map of current shared logic and service dependencies.

**Work**
- Identify all payment-related modules used by the 4 services.
- Classify shared code into:
  - pure domain logic (candidate for library),
  - service-specific adapters (keep in service),
  - infra integrations (potential plugin interface).
- Record current API surfaces used by each service.

**Verification commands**
- `npm run test --workspaces`
- `npm run lint --workspaces`
- `npm run build --workspaces`
- `npm ls --workspaces > before-deps.txt`

**Exit criteria**
- Dependency graph and extraction scope approved.
- No unknown transitive dependency from shared code into service code.

---

### Phase 1 — Package Contract and Boundary Design
**Objective:** Define a stable package API before moving files.

**Work**
- Create package skeleton: `packages/payments` (or equivalent).
- Define public API (`src/index.ts`) and mark internals private.
- Decide semver policy and initial version (`0.1.0` if unstable API, `1.0.0` if stable).
- Add changelog and release notes template.
- Add compatibility matrix mapping package version -> service version.

**Verification commands**
- `npm pack --workspace @internal/payments`
- `npm run build --workspace @internal/payments`
- `npm run test --workspace @internal/payments`
- `npm pkg get name version --workspace @internal/payments`

**Exit criteria**
- Package can build/test in isolation.
- API contract documented and reviewed by owners of all 4 services.

---

### Phase 2 — Code Extraction with Anti-Cycle Guardrails
**Objective:** Move reusable code into package with strict directional dependencies.

**Work**
- Move pure shared logic first.
- Replace service imports with package imports where safe.
- Introduce interfaces/callbacks for service-specific behaviors (dependency inversion).
- Add static checks for cycles (`madge` or `dependency-cruiser`).
- Enforce rule: `services -> @internal/payments`, never inverse.

**Verification commands**
- `npm run build --workspace @internal/payments`
- `npm run test --workspace @internal/payments`
- `npx madge --circular packages/payments/src`
- `npx madge --circular services/*/src`
- `npm ls @internal/payments --workspaces`

**Exit criteria**
- No circular dependencies in package or services.
- Package has zero imports from service folders.

---

### Phase 3 — Internal Publishing Pipeline
**Objective:** Make package versioned and consumable from internal registry.

**Work**
- Configure private scope and registry auth in CI.
- Publish pre-release tag first (`next`), then stable (`latest`).
- Add automated versioning flow (changesets/semantic-release/manual gated release).
- Add provenance metadata + changelog generation.

**Verification commands**
- `npm whoami --registry <internal-registry-url>`
- `npm publish --tag next --workspace @internal/payments`
- `npm view @internal/payments versions --registry <internal-registry-url>`
- `npm pack --workspace @internal/payments` (smoke artifact check)

**Exit criteria**
- Package installable from registry in clean environment.
- At least one pre-release version available.

---

### Phase 4 — Incremental Consumer Migration (4 Services)
**Objective:** Migrate services one by one with canary rollout.

**Work**
- Migrate 1 low-risk service first (pilot), then remaining 3.
- Replace local imports with `@internal/payments`.
- Pin exact version initially; widen range after stabilization.
- Run service-level regression and payment flow integration tests.
- Roll out progressively by environment (dev -> staging -> prod).

**Verification commands (per service)**
- `npm install @internal/payments@<version> --workspace <service-name>`
- `npm run build --workspace <service-name>`
- `npm run test --workspace <service-name>`
- `npm run test:integration --workspace <service-name>`
- `npm run smoke:payments --workspace <service-name>`

**Exit criteria**
- Each migrated service passes CI and payment smoke checks.
- No payment error-rate regression in monitoring after rollout window.

---

### Phase 5 — Stabilization, Deprecation, and Cleanup
**Objective:** Remove duplicate legacy shared code safely.

**Work**
- Deprecate old in-repo shared payment paths with warnings.
- Remove dead code only after all 4 services are migrated.
- Lock architecture rules to prevent reintroducing local forks.
- Finalize runbook for future package upgrades.

**Verification commands**
- `rg "from ['\"].*payments.*shared" services packages` (ensure legacy imports removed)
- `npm run test --workspaces`
- `npm run build --workspaces`
- `npm audit --workspaces`

**Exit criteria**
- Single source of truth is `@internal/payments`.
- Upgrade/release process documented and repeatable.

---

## Dependency-Cycle Risk Analysis

- **Risk 1: Package imports service modules (hard cycle)**  
  - Cause: direct imports from `services/*` during extraction.  
  - Mitigation: lint/dependency rule forbidding such imports; CI gate with `madge`/`depcruise`.  
  - Detection: cycle check fails in PR.

- **Risk 2: Shared package pulls service-specific infra transitively**  
  - Cause: shared logic depends on service-only SDK wrappers.  
  - Mitigation: introduce ports/interfaces; inject adapters from services.  
  - Detection: dependency graph review + isolated package build.

- **Risk 3: Barrel exports create hidden re-export loops**  
  - Cause: `index.ts` re-export chains across domains.  
  - Mitigation: one-way module layering (`domain -> app -> adapters`), no reverse exports.  
  - Detection: cycle scanner on TS source plus import boundaries test.

- **Risk 4: Version skew across 4 services**  
  - Cause: incompatible package updates consumed at different times.  
  - Mitigation: compatibility matrix, semver discipline, release notes with breaking flags.  
  - Detection: CI matrix tests against supported versions.

- **Risk 5: Runtime behavior drift after “pure logic” extraction**  
  - Cause: hidden reliance on service globals/config.  
  - Mitigation: contract tests in package + service integration tests + canary rollout.  
  - Detection: payment success/failure telemetry comparison pre/post migration.

---

## Rollback Strategy

### Rollback levels
- **L1: Service-only rollback**  
  - Revert one service to previous dependency version (`@internal/payments@old`) or local implementation.
- **L2: Package rollback**  
  - Deprecate bad package version, republish patch, or repoint consumers to last known good.
- **L3: Full migration freeze**  
  - Stop further service migrations; keep pilot only until issue resolved.

### Practical rollback mechanics
- Keep legacy payment code path behind feature flag until all services stabilize.
- Tag every migration PR and package release with matching identifiers.
- Maintain lockfile snapshots per service during rollout.
- Have “last known good” package version documented in runbook.

### Rollback verification commands
- `npm install @internal/payments@<last-good> --workspace <service-name>`
- `npm ci --workspace <service-name>`
- `npm run test:integration --workspace <service-name>`
- `npm run smoke:payments --workspace <service-name>`

---

## Acceptance Criteria
- `@internal/payments` published to internal registry with semver releases.
- All 4 services consume package version(s) from registry (no local shared copy).
- CI enforces no dependency cycles and no reverse dependency from package to services.
- Regression tests + payment smoke tests pass for all services.
- Rollback runbook tested at least once in non-prod.