## Doctor-Style Diagnosis: `pip` Installing to Wrong Environment

Use this exact order so each check narrows the failure mode cleanly.

### 1) Check executable resolution (`python` / `pip`)

Run:
```bash
which python
which pip
python -V
pip -V
python -m pip -V
```

**Pass criterion**
- `which python` and `which pip` point to the same environment prefix (same venv/conda/system root).
- `pip -V` and `python -m pip -V` report the same `.../site-packages` path.

**Failure modes + recommended fix**
- **Mismatch:** `pip` points to global/system while `python` points to venv (or vice versa).  
  - Fix: always install with `python -m pip install -r requirements.txt`.
  - Fix PATH ordering so env’s `bin` is first.
- **`pip` command not tied to desired interpreter:**  
  - Fix: use interpreter-specific invocations (`python3.11 -m pip ...` etc).

---

### 2) Check active virtual environment state

Run:
```bash
echo "$VIRTUAL_ENV"
python -c "import sys; print(sys.prefix); print(sys.base_prefix)"
```

**Pass criterion**
- If you expect a venv: `$VIRTUAL_ENV` is set and `sys.prefix != sys.base_prefix`.
- If you do **not** expect a venv: `$VIRTUAL_ENV` empty and `sys.prefix == sys.base_prefix`.

**Failure modes + recommended fix**
- **Expected venv but not active:**  
  - Fix: activate it (`source .venv/bin/activate`) before install.
- **Unexpected venv active:**  
  - Fix: `deactivate` (or open a clean shell) then run install in intended env.

---

### 3) Check `pip` target location directly

Run:
```bash
python -m pip show pip
python -m site
python -c "import site; print(site.getsitepackages()); print(site.getusersitepackages())"
```

**Pass criterion**
- Reported install target aligns with intended environment’s `site-packages`.

**Failure modes + recommended fix**
- **Installing to user site (`~/.local/...`) unexpectedly:**  
  - Fix: remove `--user` usage for that workflow; ensure venv is active.
- **System site used unintentionally:**  
  - Fix: use project-local venv and install via `python -m pip`.

---

### 4) Check `PYTHONPATH` and shell env contamination

Run:
```bash
echo "$PYTHONPATH"
env | rg '^(PYTHONPATH|PIP_|VIRTUAL_ENV|CONDA_)'
```

**Pass criterion**
- `PYTHONPATH` is empty (or intentionally set and understood).
- No unexpected `PIP_TARGET`, `PIP_PREFIX`, `PIP_CONFIG_FILE`, etc.

**Failure modes + recommended fix**
- **`PYTHONPATH` forcing import precedence:**  
  - Fix: unset it for normal installs (`unset PYTHONPATH`) or scope it per-command.
- **`PIP_*` vars redirecting install location:**  
  - Fix: unset offending vars; review shell rc files.

---

### 5) Check pip config overrides

Run:
```bash
python -m pip config list -v
```

**Pass criterion**
- No unexpected `target`, `prefix`, `user=true`, or custom config file overriding destination.

**Failure modes + recommended fix**
- **Config enforces wrong target/prefix/user:**  
  - Fix: edit/remove that config entry in the shown config file path.

---

### 6) Check alias/function shadowing

Run:
```bash
type python
type pip
alias | rg '(^alias python=|^alias pip=)'
```

**Pass criterion**
- `python`/`pip` resolve to expected binaries, not shell aliases/functions wrapping unexpected executables.

**Failure modes + recommended fix**
- **Alias/function hijack:**  
  - Fix: remove/update alias/function in shell profile.

---

## Safe Remediation Baseline (recommended default)

For project installs, prefer this invariant command:
```bash
python -m pip install -r requirements.txt
```
And in team docs, pin interpreter creation/activation explicitly:
```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

---

## No-Destructive Auto-Fix Policy

- No automatic deletion of environments, packages, or config files.
- No automatic PATH rewrites, shell profile edits, or global pip config edits.
- No forced uninstall/reinstall without explicit user approval.
- Diagnosis is read-only first; apply fixes only after confirming intended interpreter/environment with the user.