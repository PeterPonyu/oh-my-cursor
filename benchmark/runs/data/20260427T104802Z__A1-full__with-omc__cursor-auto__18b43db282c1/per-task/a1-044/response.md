I’ll quickly inspect the target files first so the plan is concrete and includes real conflict-avoidance/verification steps per file. Then I’ll provide the exact header template and a file-by-file batch strategy.Use this batched-edit plan to add SPDX headers safely and verify each target file.

## Exact Header Pattern

Insert this exact two-line header at the top of each target file:

```python
# SPDX-FileCopyrightText: <YEAR> <COPYRIGHT HOLDER>
# SPDX-License-Identifier: <LICENSE-ID>
```

Example concrete instance (replace placeholders once for all 18 files):

```python
# SPDX-FileCopyrightText: 2026 Your Name or Organization
# SPDX-License-Identifier: MIT
```

Then add one blank line before existing module content.

## Per-File Scope (18 files)

Apply only to these paths:

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

## Conflict-Avoidance Rules (Already-Header Cases)

For each file, before insertion:

- If first ~10 lines already contain `SPDX-License-Identifier:`, **do not add** a second SPDX block.
- If old-style copyright/license comment exists but no SPDX tag:
  - keep existing legal text,
  - insert SPDX block above it (or replace only if your policy allows normalization).
- Preserve shebang/encoding precedence:
  - if file starts with `#!/usr/bin/env python...`, keep shebang at line 1, put SPDX block immediately after it;
  - if encoding cookie exists in first/second line, keep it valid per Python rules and place SPDX after required cookie position.
- Preserve module docstring semantics:
  - if file begins with a module docstring, place SPDX comments before docstring (unless project policy requires docstring first; keep consistent across all 18).
- Ensure idempotency: running the batch twice yields no duplicate SPDX lines.

## Batched Edit Execution Plan

1. Preflight:
   - confirm all 18 target files exist;
   - flag missing files but continue with existing ones (or fail-fast if strict policy).
2. For each file, apply deterministic transform:
   - detect shebang/encoding/SPDX presence in first lines;
   - compute insertion point;
   - insert exact SPDX block if absent.
3. Write all edits in one batch operation/script for consistency.
4. Produce per-file result status: `added`, `already_present`, `skipped_missing`, or `error`.

## Per-File Verification After Batch

For each of the 18 files, verify all of:

- file exists (unless expected missing),
- exactly one `SPDX-License-Identifier:` line,
- expected `LICENSE-ID` value matches chosen identifier,
- SPDX block is in valid top-of-file location (respecting shebang/encoding),
- no duplicate or conflicting SPDX headers.

Suggested verification output format (one line per file):

- `src/pkg/a.py | added | SPDX ok | placement ok`
- `src/pkg/b.py | already_present | SPDX ok | unchanged`
- `src/pkg/c.py | error | duplicate SPDX found`

If you want, I can execute this now as a single scripted batch and return the per-file verification table.