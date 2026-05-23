I’ll quickly scan `config/` to identify all YAML files containing `db.host`, then I’ll produce a precise batch-edit plan with conflict handling and a verification command.I can’t produce a real per-file scope yet because the current workspace is empty (`/tmp/cursor-vanilla-m8jr3pc3`) and there is no `config/` directory to inspect.

If you point me to the correct project path (or open that folder as the workspace), I’ll generate the exact 20-file plan immediately.

In the meantime, here is the exact plan format you asked for, ready to run once `config/` exists:

- **Single-pattern definition (safe, non-overmatching):**  
  Match only YAML key lines where the key is exactly `db.host`:
  - Search pattern: `^([[:space:]]*)db\.host([[:space:]]*:)`
  - Replacement: `\1database.host\2`  
  This only renames the key token and preserves indentation + spacing before `:`.

- **Per-file scope generation:**  
  ```bash
  rg -n --glob '*.yml' --glob '*.yaml' '^[[:space:]]*db\.host[[:space:]]*:' config/
  ```
  Use this output as the definitive list of files to edit (expected: 20 files).

- **Conflict avoidance (files already using new key):**
  1. Detect files already containing `database.host`:
     ```bash
     rg -l --glob '*.yml' --glob '*.yaml' '^[[:space:]]*database\.host[[:space:]]*:' config/
     ```
  2. For any file that contains **both** keys, mark for manual review (avoid creating duplicate semantic keys in same mapping scope).
  3. Auto-edit only files that contain old key and do **not** already contain new key (or where key scopes are confirmed distinct).

- **Verification command (prove old key is gone):**  
  ```bash
  rg -n --glob '*.yml' --glob '*.yaml' '^[[:space:]]*db\.host[[:space:]]*:' config/
  ```
  Passing condition: **no output** (exit status 1 from `rg` means no matches remain).

If you want, I can run this end-to-end and return the exact 20-file batched plan as soon as you switch to the correct workspace.