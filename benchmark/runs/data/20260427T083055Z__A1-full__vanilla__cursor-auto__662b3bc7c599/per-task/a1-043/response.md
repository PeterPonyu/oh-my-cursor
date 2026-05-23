Use one codemod-style rename pattern and constrain it to import specifiers only.

## Single Pattern Definition

- **Match (regex):** `\boldUtil\b`
- **Replacement:** `newUtil`
- **Apply only inside import clauses**, specifically:
  - `import { ..., oldUtil, ... } from '...'`
  - `import { oldUtil as alias } from '...'` (becomes `newUtil as alias`)
  - `import oldUtil from '...'` (default import symbol rename)
- **Do not apply** outside import declarations in this batch (usage-site renames can be a follow-up if needed).

## Per-File Scope (12 files)

- `a/x.ts`
- `a/y.ts`
- `a/z.ts`
- `a/a.ts`
- `a/b.ts`
- `a/c.ts`
- `a/d.ts`
- `a/e.ts`
- `a/f.ts`
- `a/g.ts`
- `a/h.ts`
- `a/l.ts`

(If your actual 12-file list differs, keep the same pattern but limit edits to that explicit list only.)

## Conflict-Avoidance Reasoning

- Restricting edits to **import declarations** avoids accidental changes to:
  - string literals (`"oldUtil"`)
  - comments/docs
  - object keys/types named `oldUtil`
  - unrelated local variables/functions also named `oldUtil`
- Constraining to an explicit 12-file path list prevents cross-package drift in a monorepo.
- Renaming imported symbol while preserving aliases (`newUtil as alias`) avoids API/usage breakage where local alias names are intentional.
- Running a post-batch unresolved-symbol/typecheck command catches any places where import rename requires usage rename or export updates.

## Verification Command After Batch

```bash
rg -n "\boldUtil\b" a/x.ts a/y.ts a/z.ts a/a.ts a/b.ts a/c.ts a/d.ts a/e.ts a/f.ts a/g.ts a/h.ts a/l.ts && pnpm -r typecheck
```

- `rg` ensures no `oldUtil` remains in the target files.
- `pnpm -r typecheck` validates monorepo-wide TS integrity after the rename.