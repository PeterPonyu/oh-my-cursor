Use one scoped codemod pattern so only **imported bindings** are renamed, not arbitrary identifiers/strings.

- **Single-pattern definition**
  - Target only import specifiers named `oldUtil`:
  - **Pattern:** `import { ..., oldUtil, ... } from '...';` → `import { ..., newUtil, ... } from '...';`
  - **Also handle alias form safely:** `import { oldUtil as localName } from '...';` should become `import { newUtil as localName } from '...';`
  - If there are default/namespace imports, skip unless `oldUtil` is actually the imported symbol name (avoid blind text replace).

- **Per-file scope (batch list)**
  - `a/x.ts`
  - `a/y.ts`
  - `a/z.ts`
  - `a/aa.ts`
  - `a/bb.ts`
  - `a/cc.ts`
  - `a/dd.ts`
  - `a/ee.ts`
  - `a/ff.ts`
  - `a/gg.ts`
  - `a/hh.ts`
  - `a/l.ts`

- **Conflict-avoidance reasoning**
  - Restrict rewrite to `ImportSpecifier.imported.name === "oldUtil"` (AST-aware), so:
    - no changes to comments/strings/type names/object keys.
    - no accidental rename of a local variable coincidentally named `oldUtil`.
    - alias safety is preserved (`as localName` unchanged).
  - Do not rename call sites unless they reference the same local binding; for aliased imports, usage stays on alias.
  - Run file-by-file transform with explicit allowlist (the 12 paths only), so other packages in the monorepo are untouched.

- **Verification command after batch**
  - Run:
    - `rg -n "\boldUtil\b" a/x.ts a/y.ts a/z.ts a/aa.ts a/bb.ts a/cc.ts a/dd.ts a/ee.ts a/ff.ts a/gg.ts a/hh.ts a/l.ts`
  - Expect: no matches in import positions (and ideally none at all unless intentionally aliased/local).  
  - Then run repo typecheck for safety (e.g. monorepo standard `tsc -b` / workspace check command).