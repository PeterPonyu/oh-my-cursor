I’ll map the exact `services/*/handler.js` targets first, then check which files already have a `logger` import so the batch plan can include a safe conflict-avoidance step.I couldn’t find a `services` directory at the provided workspace root, so I’m checking the actual project root layout to locate those 24 handler files before drafting the plan.Use this batched-edit plan.

- **Single replacement pattern (only one):** replace exact token `console.log(` with `logger.info(`.
- **Scope (only these files):** `services/*/handler.js` (24 files expected; no other paths touched).

Run scope capture first (freezes the target list for a deterministic batch):

```bash
mapfile -t HANDLERS < <(printf '%s\n' services/*/handler.js | sort)
printf '%s\n' "${HANDLERS[@]}"
```

Then apply the single pattern only to that frozen list:

```bash
perl -0pi -e 's/console\.log\(/logger.info(/g' "${HANDLERS[@]}"
```

### Per-file scope
For this change set, each target is exactly one `handler.js` under each immediate child of `services/`:

- `services/<service-1>/handler.js`
- `services/<service-2>/handler.js`
- ...
- `services/<service-24>/handler.js`

(Use the `mapfile` command above to print the explicit 24-file list before editing.)

### Dependencies between files
- **None expected.**
- Justification: this is a local syntactic substitution inside each file; no cross-file symbol renames, no shared interface changes, no ordering constraints.  
- Files can be edited in any order or in one batch safely.

### Conflict-avoidance when `logger` is missing
Before replacement, split files into two buckets:

```bash
with_logger=()
needs_logger=()
for f in "${HANDLERS[@]}"; do
  if rg -q '\blogger\b' "$f"; then
    with_logger+=("$f")
  else
    needs_logger+=("$f")
  fi
done
printf 'WITH LOGGER (%d)\n' "${#with_logger[@]}"; printf '%s\n' "${with_logger[@]}"
printf 'NEEDS LOGGER (%d)\n' "${#needs_logger[@]}"; printf '%s\n' "${needs_logger[@]}"
```

Safe strategy:
- Apply replacement immediately to `with_logger`.
- For `needs_logger`, add/import `logger` first (project-standard import path + style), then run the same replacement.
- This prevents introducing `logger.info(...)` calls that would throw due to undefined `logger`.

### Verification command
Use one command that checks both goals:

```bash
rg -n 'console\.log\(' services/*/handler.js && echo "FAIL: console.log remains" || (echo "PASS: no console.log left"; rg -n '\blogger\.info\(' services/*/handler.js)
```

If you want, I can execute this as a two-phase scripted edit (import-safe bucket first, then replacement) once the repo is available in the workspace.