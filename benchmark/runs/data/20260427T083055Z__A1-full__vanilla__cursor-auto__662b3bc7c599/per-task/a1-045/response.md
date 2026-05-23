I’ll quickly scan `services/*/handler.js` to map the exact 24-file scope and identify which files already define/import `logger`, then I’ll give you a concrete batched-edit plan with collision safeguards and a verification command.### Batched Edit Plan

- **Single replacement pattern (the only content rewrite):**  
  `console.log(` -> `logger.info(`  
  Use exact literal replacement (no regex capture groups needed): `s/console\.log\(/logger.info(/g`.

- **Per-file scope (fixed manifest):**  
  Limit edits to files matching `services/*/handler.js`, and freeze the file list before editing:
  ```bash
  ls services/*/handler.js | sort > /tmp/handler_manifest.txt
  wc -l /tmp/handler_manifest.txt   # expect 24
  ```
  Then process only files in `/tmp/handler_manifest.txt` (not broader globs during rewrite).

- **Dependencies between files:**  
  **None expected.** Each `handler.js` transform is local text substitution plus (if needed) a local `logger` import/definition in that same file. No cross-file symbol renames, API contract changes, or shared ordering constraints are required.

- **Conflict-avoidance for files missing `logger`:**
  1. **Preflight classify** files into:
     - already has `logger` in scope (`import`, `require`, param injection, or module-level declaration),
     - missing `logger`.
  2. **Two-phase batch:**
     - Phase A: apply `console.log(` -> `logger.info(` only to files with `logger` already available.
     - Phase B: for missing files, first add/import `logger` using the project’s existing logging pattern in that file’s module style (ESM vs CJS), then apply replacement.
  3. **Safety gate:** skip any file where introducing `logger` is ambiguous (e.g., shadowed `logger` variable, nonstandard DI factory) and flag for manual review.
  4. **Idempotency:** rerun should produce zero diffs once complete.

- **Verification command (post-edit):**
  ```bash
  rg -n "console\\.log\\(" services/*/handler.js && echo "remaining console.log found" || echo "OK: no console.log in handlers"
  ```

If you want, I can now execute this plan and produce the exact 24-file manifest plus a “needs logger import” subset before applying changes.