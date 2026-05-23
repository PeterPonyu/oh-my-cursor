# Context Recipe Library: AST-Grep Search & Refactoring

`ast-grep` is a powerful tool for structural code searching and rewriting. Unlike regex, it parses code into an Abstract Syntax Tree (AST), enabling precise pattern matching that respects code syntax and block scoping.

This guide provides practical search and rewrite recipes to speed up refactoring sessions inside Cursor.

---

## 1. Setup

Install `ast-grep` globally or run it via `npx`:

```bash
# Verify installation
npx ast-grep --version
```

---

## 2. Common Search Patterns

### Finding Functions with Too Many Arguments
Find function declarations that accept more than 4 arguments:

- **Command**:
  ```bash
  npx ast-grep --pattern "function \$NAME(\$A, \$B, \$C, \$D, \$\$\$REST) { \$\$\$BODY }" --lang typescript
  ```

### Locating Sync File Reads in Async Functions
Identify where sync filesystem calls (like `readFileSync`) are used inside async functions, which blocks the event loop:

- **Command**:
  ```bash
  npx ast-grep --pattern "async function \$FUNC(\$\$\$) { \$\$\$PRE; fs.readFileSync(\$\$\$ARGS); \$\$\$POST }" --lang typescript
  ```

### Finding Unhandled Promise Rejections
Locate Promise `.then()` calls that lack a `.catch()` block:

- **Command**:
  ```bash
  npx ast-grep --pattern "\$PROMISE.then(\$CB)" --lang typescript
  ```

---

## 3. Structural Refactoring (Rewriting) Recipes

To perform a rewrite, use the `-r` (rewrite) flag. Use `-i` to apply changes in-place.

### Recipe 1: Converting Promise Chain to Async/Await
Convert basic Promise returns to clean `async/await`:

- **Search Pattern**: `return $PROMISE.then($VAL => { $BODY })`
- **Rewrite Pattern**: `const $VAL = await $PROMISE; $BODY`
- **Command**:
  ```bash
  npx ast-grep --pattern "return \$PROMISE.then(\$VAL => { \$BODY })" -r "const \$VAL = await \$PROMISE; \$BODY" --lang typescript -i
  ```

### Recipe 2: Renaming Class Property / Method calls
Safely migrate a deprecated class method call to a new one across the codebase:

- **Search Pattern**: `$OBJ.oldProcessData($ARG)`
- **Rewrite Pattern**: `$OBJ.processDataNew({ data: $ARG })`
- **Command**:
  ```bash
  npx ast-grep --pattern "\$OBJ.oldProcessData(\$ARG)" -r "\$OBJ.processDataNew({ data: \$ARG })" --lang typescript -i
  ```

### Recipe 3: Standardizing Import Paths
Rewrite relative imports of core hooks to absolute or package-level imports:

- **Search Pattern**: `import { $M } from '../../hooks/$FILE'`
- **Rewrite Pattern**: `import { $M } from '@/hooks/$FILE'`
- **Command**:
  ```bash
  npx ast-grep --pattern "import { \$M } from '../../hooks/\$FILE'" -r "import { \$M } from '@/hooks/\$FILE'" --lang typescript -i
  ```

---

> [!TIP]
> Use `ast-grep`'s interactive mode (`--interactive` or `-I`) to preview and approve each rewrite hunk individually during large refactoring runs.
