I’ll map the repository packages and locate all API client v2 call sites first, then I’ll produce a concrete batched migration plan with per-package/file patterns, ordering, risks, and verification commands.I found this repo is mostly docs/tools, so I’m now checking whether the 4-package/40-file migration target lives under benchmark fixtures before drafting the plan.I can’t truthfully give you a real **file-by-file 40-file scope** from this workspace yet: there are no service source files or 4 package directories present in the checked-in tree I can inspect (this repo is docs/benchmark-oriented right now).  
So below is a **ready-to-run batched migration plan** you can apply immediately once pointed at the actual code packages.

## Per-package scope (explicit structure)

Use these 4 concrete buckets and lock file lists before editing:

- `package-1` (lowest-level shared services; no internal package deps)
- `package-2` (depends on `package-1`)
- `package-3` (depends on `package-1`, may depend on `package-2`)
- `package-4` (top-level app/domain services; depends on 1–3)

For each package, materialize a frozen scope file first:

```bash
# run from repo root
rg --files "packages/package-1" | rg "service|Service" > .migration/package-1-files.txt
rg --files "packages/package-2" | rg "service|Service" > .migration/package-2-files.txt
rg --files "packages/package-3" | rg "service|Service" > .migration/package-3-files.txt
rg --files "packages/package-4" | rg "service|Service" > .migration/package-4-files.txt
```

Then narrow each list to only v2 call-site files:

```bash
rg -n "clientV2|ApiClientV2|from .*v2|\\.request\\(" $(cat .migration/package-1-files.txt) > .migration/package-1-v2-hits.txt
# repeat for package-2/3/4
```

## Per-file pattern definition (safe batch vs manual)

Assume signature change: **one added argument**, **one renamed argument**.

### Safe for batch-edit
Files matching all of:
- Single import source for v2 client (e.g. `from .../v2`)
- Direct call expression with object-literal options in same line/block
- No wrapper indirection, no spread mutation before call

Typical patterns:
- `clientV2.request(endpoint, { oldName: ... })`
- `apiClientV2.<method>(..., { oldName: ... })`

Batch transform rules:
- Rename option key `oldName` -> `newName`
- Add new required arg in fixed position (`argN`) with deterministic default (or passed context var)

### Not safe for blind batch-edit
Mark for manual migration when any of:
- Dynamic property access (`client[methodName](...)`)
- Argument built via multiple spreads / conditional merges
- Wrapper helpers forwarding args (`doRequest(...args)`)
- Overloaded call forms with different arity
- Option object created far from call site (dataflow unclear)
- Files with both v2 and v3 imports already (mixed state)

## Dependency ordering between packages

1. **`package-1` first**: establishes shared helpers/types used downstream.
2. **`package-2` and `package-3` next** (parallel if independent).
3. **`package-4` last**: app/domain services consume updated lower layers.

Why: if upper packages migrate first, they may require v3-only types/contracts not yet available in shared packages, causing temporary type and runtime incompatibility.

## Conflict-avoidance reasoning

- Freeze per-package file manifests before editing (`.migration/*-files.txt`) to avoid chasing moving targets.
- Migrate one package per branch/commit chunk (or at least one commit per package) to reduce merge conflicts.
- Avoid simultaneous edits to shared helper files from multiple package batches.
- Land import rewrites + signature updates in same package commit to avoid broken intermediate states.
- Keep “unsafe/manual” files excluded from automated codemod and tracked in dedicated checklist files.

## Verification commands per package

Run after each package batch:

```bash
# 1) Ensure no v2 imports/calls remain in package
rg -n "ApiClientV2|clientV2|from .*v2" packages/package-1

# 2) Typecheck package
pnpm --filter package-1 typecheck

# 3) Unit tests focused on services
pnpm --filter package-1 test -- service

# 4) Optional lint gate
pnpm --filter package-1 lint
```

Repeat for `package-2`, `package-3`, `package-4`.

Final cross-repo gate:

```bash
rg -n "ApiClientV2|clientV2|from .*v2" packages
pnpm -r typecheck
pnpm -r test
```

## What I cannot safely batch-edit (honest callout)

Without the actual code tree, I cannot truthfully enumerate which exact files are unsafe.  
In practice, anything matching the “not safe” patterns above must be pulled out of automation and migrated manually with focused tests.

If you point me to the real monorepo path (or share the 4 package roots), I can generate the exact 40-file scope and a concrete safe/unsafe split.