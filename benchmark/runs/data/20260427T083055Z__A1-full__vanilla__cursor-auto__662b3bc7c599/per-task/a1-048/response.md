I’ll map the repository structure first so the plan is grounded in your actual 4 packages and service-file patterns, then I’ll lay out a safe batched migration strategy with explicit ordering and verification commands.I’ve loaded the planning workflow; next I’m scanning the workspace to identify the 4 package boundaries and exactly which service files reference the v2 client so the batch plan is concrete instead of generic.Cannot produce a truthful **per-package/per-file explicit plan** from this workspace yet because it is empty (`/tmp/cursor-vanilla-597mqx8a` has no project files).  
To avoid inventing details, here is the exact migration plan structure I would apply immediately once you point me to the repo root.

## What I can assert now

- **Current blocker:** no packages/files exist in the provided workspace, so I cannot name the 4 package scopes or the 40 files yet.
- **Safe next step:** provide the actual repo path (or open it here), then I’ll return a concrete table with all 40 file paths grouped by package.

## Batched edit plan (ready to apply)

Assume signature migration is:
- `v2(oldArgA, oldArgB)` -> `v3(oldArgA, newArgB, addedArgC)`  
(adapt names to your real API)

### Package dependency order

Use topological order so downstream packages only migrate after shared foundations compile:

1. **`pkg-core-client`** (shared API wrappers/types)
2. **`pkg-domain-a`** (depends on core)
3. **`pkg-domain-b`** (depends on core)
4. **`pkg-app-orchestrator`** (depends on core + domain packages)

If your graph differs, compute with workspace tooling (`pnpm -r why`, `nx graph`, `turbo run build --dry`, etc.) and keep the same rule: **providers before consumers**.

### Per-package scope definition

For each package `P`:

- Scope = files under `P/**` where both are true:
  - imports or references v2 client symbol/module
  - contains call expressions matching old signature arity or old parameter name

Candidate query shape:
- import match: `from .*client.*v2|require\(.*client.*v2`
- call match: `client\.\w+\(` plus old named arg `oldArgName:`
- arity smell: calls with exactly old argument count where callee is v2 API wrapper

### Per-file pattern definition (batchable vs non-batchable)

**Batch-editable patterns (safe codemod):**
- Direct named-argument object literal calls:
  - before: `api.getX({ oldName: foo, ... })`
  - after:  `api.getX({ newName: foo, addedArgC: DEFAULT, ... })`
- Direct positional calls where parameter mapping is deterministic:
  - before: `api.getX(a, b)`
  - after:  `api.getX(a, bRenamed, addedArgC)`

**Not safe to batch-edit (manual review required):**
- Dynamic spreads where rename target may be hidden:
  - `{ ...opts }` or merged objects from helper funcs
- Indirect wrappers/adapters:
  - `callApi(method, args)` / `invoke(clientFn, params)`
- Overloaded helper signatures sharing callsite shape
- Calls inside serialized config templates/string-built payloads
- Files mixing v2 and v3 via feature flags/conditional imports

These should be flagged and migrated manually per file.

## Conflict-avoidance reasoning

- **Single codemod rule per package per commit** to reduce merge conflicts.
- **Freeze formatting churn** during migration (no broad lint-fix commits mixed in).
- **Migrate shared wrapper package first** so downstream compile errors point to true unmigrated callsites.
- **Use deterministic defaults for added arg** only where business-safe; otherwise leave TODO + fail-fast.
- **Keep adapter compatibility shim temporarily** (`v2 -> v3 bridge`) to allow incremental package migration without breaking trunk.
- **Parallelize only independent packages** after core is green; do not parallel-edit files touched by shared re-export layers.

## Verification commands per package

Run per package after codemod + manual fixes:

- Type/lint/build:
  - `pnpm --filter <pkg> lint`
  - `pnpm --filter <pkg> typecheck`
  - `pnpm --filter <pkg> test`
  - `pnpm --filter <pkg> build`
- Signature regression scan:
  - `rg "client.*v2|oldArgName|\\b<oldMethodName>\\(" <pkg-path>`
- Optional stricter scan:
  - `rg "<addedArgC>" <pkg-path>` (ensure new arg present where required)

Then run cross-package verification:
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm -r build`

---

If you share the actual repo path, I’ll generate the exact final artifact you asked for:
- 4 concrete package scopes
- explicit file list (all 40)
- file-by-file batch/manual classification
- ordered execution plan with exact commands per package.