I’ll draft a concrete batch-edit plan for those 18 files, including an exact SPDX header template, safe insertion rules to avoid duplicate headers, and a per-file verification checklist you can run immediately after the edit. I’m quickly checking the planning skill instructions first so I can format this the way you asked.I’m validating the repository license signal so the SPDX line is exact rather than a placeholder, then I’ll give you the full per-file batch and verification plan.Use this as the batched-edit plan.

## Exact Header Pattern

Use a **single-line SPDX header** at the top of each Python file:

```python
# SPDX-License-Identifier: <LICENSE_ID>
```

If your project license is known (for example MIT), substitute it literally:

```python
# SPDX-License-Identifier: MIT
```

## Per-File Scope (18 Files)

Apply to exactly these files:

- `src/pkg/a.py`
- `src/pkg/b.py`
- `src/pkg/c.py`
- `src/pkg/d.py`
- `src/pkg/e.py`
- `src/pkg/f.py`
- `src/pkg/g.py`
- `src/pkg/h.py`
- `src/pkg/i.py`
- `src/pkg/j.py`
- `src/pkg/k.py`
- `src/pkg/l.py`
- `src/pkg/m.py`
- `src/pkg/n.py`
- `src/pkg/o.py`
- `src/pkg/p.py`
- `src/pkg/q.py`
- `src/pkg/r.py`

## Conflict-Avoidance Rules

For each file, insert only if no SPDX license header already exists.

- Detect existing header with regex match: `^# SPDX-License-Identifier:`
- If already present, **skip file** (no change).
- If file starts with shebang (`#!/usr/bin/env python3`), insert SPDX on the next line.
- If file starts with encoding cookie (`# -*- coding: utf-8 -*-`), place SPDX after shebang/encoding block.
- Add one blank line after SPDX only when needed for readability; do not reformat unrelated content.

Suggested insertion priority at file top:

1. Shebang (if present)
2. Encoding cookie (if present)
3. SPDX header
4. Existing module docstring / imports / code

## Batch Execution Strategy

- Run one scripted pass over the 18 explicit paths only.
- For each path: read first ~5 lines, decide `insert` vs `skip`, write only when needed.
- Emit a per-file action log line: `UPDATED` or `SKIPPED_ALREADY_HAS_SPDX` (or `MISSING_FILE` if absent).

## Per-File Verification After Batch

Verify every target file individually:

1. **Presence check**: confirm exactly one `SPDX-License-Identifier` line exists.
2. **Top-of-file placement check**: confirm it is in the header region (after shebang/encoding if present).
3. **No duplication check**: ensure count is `1`, not `>1`.
4. **Report row per file** with status.

Recommended verification output format (18 rows):

- `<path> | present=<yes/no> | count=<n> | placement=<ok/fix> | result=<PASS/FAIL>`

If any file fails:
- `present=no` → insert header.
- `count>1` → keep first valid header, remove duplicates.
- `placement=fix` → move header to correct top section.

If you want, I can now generate the exact shell/python one-liner script that performs this batch safely and prints the verification table.