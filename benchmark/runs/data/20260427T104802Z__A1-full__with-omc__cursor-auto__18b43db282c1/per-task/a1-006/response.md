## Migration Plan: Shared `payments` Library to Internal npm Package

### Phase 0 — Baseline and Scope Freeze
- Identify the 4 consumer services, current import paths, and owners; freeze payment-related refactors during extraction.
- Define package ownership, release policy (`semver`), and support window for old in-repo usage.
- Create an inventory of all `payments` exports and runtime dependencies (DB clients, env access, logging, framework-specific types).

**Verification commands**
- `pnpm -r list --depth 0` (or `npm -ws ls --depth 0`) to map workspace deps
- `rg "from ['\"](@|\\.\\./|\\.\\/).*payments" .` to find consumers/import shapes
- `pnpm -r test --filter "<service-a>|<service-b>|<service-c>|<service-d>"` baseline tests

---

### Phase 1 — Contract Definition and Boundary Hardening
- Define public API surface for `payments` (`index.ts` exports only).
- Remove/forbid framework-specific or service-specific coupling from public API (no direct app config, no service-owned models).
- Introduce interfaces for external concerns (storage, HTTP, queue, metrics) via dependency injection.

**Verification commands**
- `pnpm --filter payments-lib build`
- `pnpm --filter payments-lib test`
- `rg "process\\.env|from ['\"].*service-|from ['\"].*apps/" packages/payments` to catch leaks
- `depcruise --config .dependency-cruiser.js packages/payments/src` (or `madge`) for early cycle checks

---

### Phase 2 — Package Scaffold and Build/Publish Pipeline
- Create `packages/payments` (or dedicated repo if required) with:
  - `package.json` (`name`, `version`, `exports`, `types`, `files`, `publishConfig`)
  - build (`tsup`/`tsc`), tests, lint, changelog/release notes path
- Configure internal registry auth in CI, provenance if supported, and immutable version publishing.
- Add pre-release channel (`0.x` or `-rc`) for staged adoption.

**Verification commands**
- `pnpm --filter @internal/payments lint && pnpm --filter @internal/payments test && pnpm --filter @internal/payments build`
- `npm pack --dry-run --workspace @internal/payments` (validate artifact contents)
- CI dry run: `pnpm -r --filter @internal/payments... run ci`

---

### Phase 3 — Incremental Consumer Migration (One Service at a Time)
- Migrate service 1 first (pilot), then 2–4 in sequence.
- Replace local imports with package imports; keep behavior parity (no feature changes).
- For each service, pin exact/tilde version initially (avoid broad ranges during migration).
- Keep compatibility adapter in monorepo only if needed to reduce churn.

**Verification commands (per service)**
- `pnpm --filter <service-x> add @internal/payments@<target-version>`
- `pnpm --filter <service-x> test`
- `pnpm --filter <service-x> build`
- `pnpm --filter <service-x> exec node -e "require('@internal/payments')"` (or TS equivalent smoke import)
- End-to-end/smoke: `pnpm --filter <service-x> run test:e2e` (if present)

---

### Phase 4 — Full Integration Validation and Performance/Behavior Guardrails
- Run cross-service regression suite after all 4 services consume the package.
- Compare key payment flows/metrics (auth success, capture/refund latency, error rates).
- Validate backward compatibility promises and changelog quality.

**Verification commands**
- `pnpm -r --filter "<service-a>|<service-b>|<service-c>|<service-d>" test`
- `pnpm -r --filter "<service-a>|<service-b>|<service-c>|<service-d>" build`
- Contract tests: `pnpm --filter @internal/payments run test:contracts`
- Optional bundle/size check: `pnpm --filter @internal/payments run size`

---

### Phase 5 — Decommission Legacy Shared Code
- Remove old in-repo `payments` shared module after all services are migrated.
- Add lint rule/codemod guard to block legacy import paths.
- Mark migration completion with docs and ownership handoff.

**Verification commands**
- `rg "from ['\"].*legacy-payments|from ['\"].*/shared/payments" .` (should return none)
- `pnpm -r lint && pnpm -r test && pnpm -r build`
- `depcruise`/`madge` across repo to confirm no back-edges into removed module

---

## Dependency-Cycle Risk Analysis

### Primary cycle risks
- **Service-to-library back-edge**: `payments` imports code from a consuming service (common during “quick extraction”).
- **Cross-package utility loops**: `payments -> shared-utils -> payments`.
- **Type-only hidden coupling**: TS path aliases referencing service-local types from `payments`.
- **Infra client cycles**: shared DB/queue clients depend on business packages that then depend on `payments`.

### Mitigations
- Enforce one-way graph: `services -> @internal/payments`, never reverse.
- Split contracts/interfaces into a neutral package if needed (e.g., `@internal/payments-contracts`), but only if cycle actually appears.
- Ban forbidden import patterns with lint/dependency rules.
- Run cycle detection in CI gate on every PR touching `payments` or related shared packages.

### CI gate examples
- `madge --circular packages/payments/src`
- `depcruise --config .dependency-cruiser.js --fail-on circular packages`

---

## Rollback Strategy

### Package-level rollback
- Keep previous known-good package versions available in internal registry.
- Revert consumer lockfiles/dependency versions to last good release (`@internal/payments@x.y.z`).
- Use release tags (`stable`, `candidate`) so rollback is tag flip + lockfile update, not republish.

### Service-level rollback
- Migrate each service in its own PR/deploy window.
- If a service fails post-deploy:
  - revert service dependency bump PR,
  - redeploy service with prior lockfile/image,
  - open incident follow-up without blocking other unaffected services.

### Repository rollback guardrails
- Do not delete legacy module until all 4 services run stable for agreed soak period.
- Keep a temporary compatibility shim branch ready for hotfix cherry-picks.
- Feature-flag risky behavioral changes separately from extraction to isolate rollback blast radius.

---

## Explicit Non-Goals
- No payment business-logic redesign during extraction.
- No cross-service API standardization beyond what is required for package boundaries.
- No infra/platform migration (registry move, runtime upgrade, CI rewrite) unless already planned.
- No immediate major-version churn; avoid `1.0` promises before migration stability.
- No broad monorepo restructuring unrelated to `payments` extraction.

---

If useful, I can turn this into a concrete execution checklist template (PR-by-PR with owners, ETA, and exact CI gates) for your 4 named services.