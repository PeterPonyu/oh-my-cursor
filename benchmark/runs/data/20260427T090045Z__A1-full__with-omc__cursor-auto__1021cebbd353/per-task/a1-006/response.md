I’ll map the existing `payments` usage in the monorepo first so the plan is grounded, then I’ll provide an ordered migration plan with risk analysis, verification commands, rollback, and non-goals.## Extraction Plan: Shared `payments` Internal Package

Assumption: this is a planning request (no code changes yet), and the target is a private npm package (e.g. `@your-org/payments`) consumed by 4 services in the same org.

### Phase 0 — Baseline and Contract Freeze
- Define package scope and ownership: what `payments` APIs are stable vs internal.
- Produce an API contract doc (exported functions/types/errors only) and freeze new feature work during extraction window.
- Inventory all 4 consuming services: current import paths, runtime versions, build tools, and release cadence.
- Choose package/release model: private npm registry, semver policy, dist-tag policy (`latest`, `next`), and support window.

**Verification commands**
- `npm ls --workspaces` (or your workspace manager equivalent)  
- `rg "from .*payments|require\\(.*payments"` across monorepo  
- `npm test` and service integration tests to capture pre-migration baseline

---

### Phase 1 — Dependency Graph & Cycle Risk Elimination
- Build a graph of `payments` dependencies (internal libs, DB clients, config, logging, service-specific modules).
- Identify and remove bidirectional edges before extraction.
- Split concerns into layers:
  - `payments-core` (domain logic, pure types, invariants)
  - adapters (DB/http/cache/env/logging) behind interfaces
  - service composition lives outside package
- Ensure extracted package has no reverse dependency on any consumer service.

**Dependency-cycle risk analysis**
- **Primary risk:** current `payments` code imports service-local utilities; once extracted, consumers re-import package, creating hidden cycles.
- **Secondary risk:** shared “common” libs that already import service code transitively.
- **Build-time risk:** TS path aliases can mask cycles until publish/install.
- **Runtime risk:** singleton/config side effects (env loading, global logger init) cause implicit coupling.

**Mitigations**
- Enforce directional boundaries (`core -> adapters`, never `core -> services`).
- Add static cycle detection in CI (e.g. `madge`, `depcruise`).
- Replace side-effectful imports with dependency injection/factories.
- Ban monorepo-internal path imports in package source (only relative/local package deps).

**Verification commands**
- `npx madge --circular path/to/payments`  
- `npx depcruise --validate .dependency-cruiser.js path/to/payments`  
- `tsc --noEmit` (or language equivalent) from package root

---

### Phase 2 — Package Scaffold and Build/Publish Pipeline
- Create internal package folder with:
  - `package.json` (name, `exports`, `types`, `files`, peer/deps)
  - build config (tsup/tsc/rollup), test config, lint config
  - README with migration examples and compatibility matrix
- Set package API boundaries (explicit entry points; no deep imports).
- Configure private registry auth in CI and local dev onboarding docs.
- Implement automated versioning/release pipeline (changesets/semantic-release/manual gated).

**Verification commands**
- `npm pack --dry-run` (verify published files)  
- `npm run build && npm run test` in package  
- `npm publish --dry-run --registry <internal-registry>`  
- `npm view @your-org/payments versions --registry <internal-registry>` (after first publish)

---

### Phase 3 — Dual-Path Adoption in Consumers (Service-by-Service)
- Migrate one canary service first; keep compatibility layer to reduce blast radius.
- Replace local imports with package imports in each service, one at a time.
- Pin explicit version initially (no broad ranges) for controlled rollout.
- Repeat for remaining 3 services after canary confidence.

**Recommended order**
1. Lowest traffic / easiest rollback service  
2. Service with best test coverage  
3. Medium criticality service  
4. Highest criticality service last

**Verification commands (per service)**
- `npm install @your-org/payments@x.y.z`  
- `npm run build`  
- `npm test`  
- `npm run test:integration` (or equivalent)  
- `npm run start` in staging + smoke tests (payment auth/capture/refund flows)

---

### Phase 4 — Production Rollout and Observability Gates
- Release by environment waves (dev -> staging -> prod subset -> full prod).
- Add package-version dimension to logs/metrics so incidents can be tied to specific versions.
- Define SLO/error-budget gates for payment failures before moving to next service.
- Hold old local implementation for one release window as emergency fallback.

**Verification commands**
- Deployment checks: `kubectl rollout status ...` / platform equivalent  
- Health checks and synthetic transactions  
- Metrics queries for payment success rate/latency/error classes by service+package version

---

### Phase 5 — Decommission and Policy Enforcement
- Remove old monorepo-local `payments` implementation after all 4 services are stable.
- Add lint/CI guardrails to prevent reintroduction of local shared copy.
- Document upgrade playbook and incident rollback runbook.

**Verification commands**
- `rg "legacy/payments|old/payments/path"` returns none  
- full monorepo CI: build + tests + dependency checks  
- optional policy check (ESLint custom rule / depcruise forbidden imports)

---

## Rollback Strategy

### Fast rollback (service-level)
- Revert service dependency to previous known-good package version (or previous lockfile) and redeploy.
- Keep backward-compatible API surface across at least one minor version to allow quick downgrade.

### Package-level rollback
- Deprecate bad version in registry and republish fixed patch.
- Move dist-tag back (e.g. `latest` -> prior stable) so new installs avoid bad release.

### Code-path rollback
- Feature-flag package-backed execution path in each service (if feasible), allowing switch back to legacy path without full redeploy.

### Operational rollback checklist
- Trigger condition: elevated payment failure rate/latency threshold.
- Actions: halt rollout, pin previous version, redeploy impacted services, validate synthetic payments, declare incident resolved criteria.

---

## Explicit Non-Goals
- Rewriting payment domain logic or changing business rules during extraction.
- Consolidating unrelated shared utilities into the package.
- Cross-language SDK generation in this migration.
- Public npm publication (scope is internal/private registry only).
- Major API redesign beyond minimal compatibility needed for extraction.
- Immediate optimization/perf refactor unless required to preserve behavior.

---

## Suggested Deliverables
- `payments-extraction-rfc.md` (scope, contract, risks, rollout)
- dependency graph artifact + cycle report
- migration checklist per service
- rollback runbook + on-call playbook
- semver and release governance doc

If useful, I can turn this into a concrete week-by-week timeline with owners and a PR sequence template for each phase.