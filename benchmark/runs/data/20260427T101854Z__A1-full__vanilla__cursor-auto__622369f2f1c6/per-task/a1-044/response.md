Understood — I’ll produce a concrete batched-edit plan with an exact SPDX header template, file-by-file scope for `src/pkg/a.py` through `src/pkg/r.py`, safe guards for pre-existing headers, and a per-file verification checklist. I’ll quickly check the planning skill instructions first, then return the plan.I’ve got enough to provide a direct, implementation-ready plan now; I’ll include an idempotent insertion strategy so files with existing SPDX/copyright/docstring headers aren’t duplicated.## Batched Edit Plan: SPDX Headers for `src/pkg/a.py` ... `src/pkg/r.py`

### Exact Header Pattern
Use this exact 2-line header at file top (followed by one blank line before code):

```python
# SPDX-FileCopyrightText: <YEAR> <COPYRIGHT-HOLDER>
# SPDX-License-Identifier: <LICENSE-ID>

```

Recommended concrete values (if not otherwise specified):
- `<YEAR>`: current year (e.g. `2026`)
- `<COPYRIGHT-HOLDER>`: your org/name
- `<LICENSE-ID>`: SPDX short ID (e.g. `MIT`, `Apache-2.0`, `BSD-3-Clause`)

---

### Per-file Scope (18 files)
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

---

### Conflict-Avoidance / Idempotent Rules
For each file, apply in this order:

- If file already contains `SPDX-License-Identifier:` anywhere in initial header block, **skip insertion** (or normalize only if you explicitly want standardization).
- If file begins with shebang (e.g. `#!/usr/bin/env python3`), insert SPDX block **immediately after shebang**.
- If file begins with encoding cookie (e.g. `# -*- coding: utf-8 -*-`) and no shebang, insert SPDX block **after encoding line**.
- If both shebang and encoding cookie exist, keep order: shebang, encoding, SPDX block.
- Do not duplicate existing copyright line if already present with SPDX form.
- Preserve module docstring and imports; only prepend/insert header block + one separating blank line.

Safe insertion anchor logic:
1. Detect first insertion index after optional shebang + encoding cookie.
2. Check first ~20 lines for existing `SPDX-License-Identifier:`.
3. Insert only if absent.

---

### Batch Execution Shape
Use one scripted pass over the 18 explicit paths (not wildcard-only targeting), so scope is locked and auditable:

1. Preflight: verify all 18 paths exist; fail/flag missing files.
2. Process each file with idempotent rules above.
3. Emit per-file status: `inserted`, `already_present`, `missing`, `error`.

---

### Per-file Verification After Batch
For each of the 18 files, verify all checks:

- Header presence:
  - `SPDX-License-Identifier:` appears exactly once near file top.
  - `SPDX-FileCopyrightText:` appears near file top.
- Placement correctness:
  - If shebang/encoding existed, SPDX block is placed after them.
- No duplication:
  - No second SPDX block elsewhere.
- Syntax safety:
  - File still parses as Python.

Practical verification checklist per file:
- `exists`: yes/no
- `status`: inserted/already_present/missing/error
- `spdx_id_count`: expected `1`
- `top_block_ok`: yes/no
- `python_parse_ok`: yes/no

If you want, I can generate the exact idempotent script next (with a per-file JSON/CSV report) and run it.