I’ll quickly scan `config/` to identify the exact 20 YAML files that still contain `db.host`, then I’ll give you a precise batch-edit plan with a safe match pattern, conflict handling for files already using `database.host`, and a verification command.I hit a path mismatch (`config/` doesn’t exist at the current workspace root), so I’m locating where your project files are first, then I’ll produce the exact scoped plan.Use this as a **safe batched plan**.

### 1) Single-pattern definition (precise, non-overmatching)

- **Match only YAML key lines** where the key is exactly `db.host`:
  - Pattern: `^[[:space:]]*db\.host[[:space:]]*:`
- This avoids touching:
  - values like `url: "db.host:5432"`
  - comments
  - unrelated keys like `db.hostname`

For replacement, keep indentation and spacing:
- Replace `^([[:space:]]*)db\.host([[:space:]]*:)`
- With `\1database.host\2`

---

### 2) Per-file scope (exact 20-file target set)

Build the scope first, and freeze it before editing:

```bash
mapfile -t TARGET_FILES < <(
  rg -l --glob '*.yml' --glob '*.yaml' '^[[:space:]]*db\.host[[:space:]]*:' config | sort
)

printf '%s\n' "${TARGET_FILES[@]}"
echo "count=${#TARGET_FILES[@]}"
```

- Require `count=20` before proceeding.
- This gives explicit per-file scope (one path per line).

---

### 3) Conflict-avoidance (files already containing `database.host`)

Before replacing, split files into:
- **safe**: has old key, does not already have new key
- **conflict**: has both old and new keys (skip auto-edit)

```bash
SAFE_FILES=()
CONFLICT_FILES=()

for f in "${TARGET_FILES[@]}"; do
  if rg -q '^[[:space:]]*database\.host[[:space:]]*:' "$f"; then
    CONFLICT_FILES+=("$f")
  else
    SAFE_FILES+=("$f")
  fi
done

printf 'SAFE (%d)\n' "${#SAFE_FILES[@]}"
printf '%s\n' "${SAFE_FILES[@]}"
printf 'CONFLICT (%d)\n' "${#CONFLICT_FILES[@]}"
printf '%s\n' "${CONFLICT_FILES[@]}"
```

Then edit only `SAFE_FILES`:

```bash
for f in "${SAFE_FILES[@]}"; do
  perl -i -pe 's/^([[:space:]]*)db\.host([[:space:]]*:)/$1database.host$2/' "$f"
done
```

---

### 4) Verification command (prove old key is gone)

Run this after edits:

```bash
rg -n --glob '*.yml' --glob '*.yaml' '^[[:space:]]*db\.host[[:space:]]*:' config && echo "FAIL: old key remains" || echo "PASS: no db.host key remains"
```

Optional stricter proof (also show new-key presence count):

```bash
echo "old_key_count=$(rg -c --glob '*.yml' --glob '*.yaml' '^[[:space:]]*db\.host[[:space:]]*:' config | awk -F: '{s+=$2} END {print s+0}')"
echo "new_key_count=$(rg -c --glob '*.yml' --glob '*.yaml' '^[[:space:]]*database\.host[[:space:]]*:' config | awk -F: '{s+=$2} END {print s+0}')"
```

If you want, I can convert this into a single idempotent bash script that exits non-zero on any conflict or leftover `db.host`.