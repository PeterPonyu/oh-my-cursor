I’ll run a quick environment diagnosis in the current shell using the exact checks you listed (`which python/pip`, virtualenv state, `$VIRTUAL_ENV`, and `PYTHONPATH`) and then map each result to pass/fail criteria plus safe fixes.Use this **doctor-style runbook** to diagnose “`python` is on PATH, but `pip install -r requirements.txt` goes to wrong site-packages”.

## Diagnosis (ordered)

Run these in the same shell where the problem occurs:

```bash
which python
which pip
python --version
pip --version
python -m pip --version
echo "$VIRTUAL_ENV"
python -c "import sys; print(sys.executable); print(sys.prefix); print(sys.base_prefix)"
echo "$PYTHONPATH"
```

## Check-by-check criteria and fixes

- **1) `which python`**
  - **Pass:** points to expected interpreter (system, pyenv shim, or venv path).
  - **Fail mode:** unexpected binary (e.g., `/usr/bin/python` instead of project venv).
  - **Recommended fix:** activate intended env first (`source .venv/bin/activate`), or call explicit interpreter path.

- **2) `which pip`**
  - **Pass:** `pip` path matches the same environment family as `python`.
  - **Fail mode:** `pip` from different install (Homebrew/system/user) than `python`.
  - **Recommended fix:** stop using bare `pip`; use `python -m pip ...` with the intended `python`.

- **3) `pip --version` vs `python -m pip --version`**
  - **Pass:** both report same Python version and same site-packages root.
  - **Fail mode:** they differ (classic PATH mismatch).
  - **Recommended fix:** standardize on:
    - `python -m pip install -r requirements.txt`
    - optionally alias `pip='python -m pip'` in shell config if desired.

- **4) Active virtualenv state**
  - **Check:** `echo "$VIRTUAL_ENV"` and `sys.prefix != sys.base_prefix`.
  - **Pass:** for venv workflow, `VIRTUAL_ENV` is set and prefix differs from base.
  - **Fail mode:** env not active (or different env active).
  - **Recommended fix:** deactivate wrong env, activate correct one:
    - `deactivate` (if needed)
    - `source .venv/bin/activate`
    - re-check `which python` and `python -m pip --version`.

- **5) `PYTHONPATH`**
  - **Pass:** empty/unset unless intentionally used.
  - **Fail mode:** points to old/global/custom directories and shadows imports.
  - **Recommended fix:** temporarily unset and retest:
    - `unset PYTHONPATH`
    - if needed, remove from shell startup files.

## High-confidence safe workflow

Use this exact install form to avoid cross-interpreter installs:

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

And verify destination:

```bash
python -c "import site; print(site.getsitepackages())"
python -m pip show <some-installed-package>
```

## No-destructive-auto-fix policy

- I will **not** auto-edit shell rc files, global Python installs, symlinks, or PATH ordering without explicit approval.
- I will **not** uninstall packages or delete environments automatically.
- I will only suggest/read-only checks first; any mutating step should be opt-in and explicit.