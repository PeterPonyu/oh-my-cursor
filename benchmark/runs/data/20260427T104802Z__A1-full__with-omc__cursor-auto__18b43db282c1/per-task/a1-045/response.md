I’ll map the exact `services/*/handler.js` targets first, then check which already have a `logger` import so the batching plan includes conflict-avoidance for files that don’t.I didn’t find a top-level `services/` folder, so I’m locating all matching `handler.js` files in the repo to build the exact per-file scope you asked for.I’m blocked on the “per-file scope” detail right now: this workspace has no `services/*/handler.js` files (I also checked for any `handler.js` at all). I’ll still give you a complete batched plan structure with exact commands, and if you share the correct root path I can immediately expand it to the explicit 24-file list.`services/*/handler.js` does not exist in the current workspace, so I can’t produce the explicit 24-file list from this repo snapshot yet.  
Here is the exact batched plan, ready to run once the correct root/path is confirmed.

## Batched Edit Plan

- **Single pattern definition**
  - Replacement target: literal `console.log(`  
  - Replacement value: `logger.info(`  
  - Scope guard: only files matching `services/*/handler.js` under the intended project root.
  - Non-goals: do not change `console.error`, `console.warn`, comments, or string literals that merely contain the text.

- **Per-file scope (explicit)**
  - Scope expression: `services/*/handler.js` (expected 24 files).
  - Generate explicit list before edits:
    - `rg --files services | rg '/handler\.js$'`
  - Freeze the list to avoid drift during edit:
    - `rg --files services | rg '/handler\.js$' > /tmp/handler-files.txt`
  - Use `/tmp/handler-files.txt` as the source of truth for batching and verification.

- **Dependencies between files**
  - **None expected.**
  - Justification: each `handler.js` edit is a local token substitution (`console.log(` -> `logger.info(`) with no cross-file symbol coupling, no shared import graph mutation required for correctness of the replacement itself, and no ordering constraints between files.
  - The only per-file caveat is whether `logger` is in scope in that same file (handled below).

- **Conflict-avoidance for files missing `logger` import/binding**
  - Pre-scan each target for existing `logger` definition/import before replacement.
  - Treat a file as “safe direct replace” if it already has one of:
    - `const logger = ...`
    - `import logger from ...`
    - `const { logger } = ...`
  - For files without `logger`:
    - Stage 1: add/normalize `logger` import according to existing module style in that file (`require` vs `import`), using the project’s canonical logger module path.
    - Stage 2: apply `console.log(` -> `logger.info(` replacement.
  - This prevents introducing runtime `ReferenceError: logger is not defined`.

- **Verification command**
  - Primary success check (no remaining `console.log(` in target scope):
    - `rg -n "console\\.log\\(" services/*/handler.js`
  - Optional coverage checks:
    - `rg -n "\\blogger\\b" services/*/handler.js` (confirm logger presence in edited files)
    - `git diff -- services/*/handler.js` (review only intended files changed)

If you share the correct project root (or where those 24 files live), I’ll return the exact per-file list immediately.