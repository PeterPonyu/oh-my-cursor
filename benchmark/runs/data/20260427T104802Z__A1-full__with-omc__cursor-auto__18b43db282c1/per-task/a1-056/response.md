I’ll run a quick environment audit in the requested order (`python`/`pip` resolution, virtualenv state, and related env vars), then I’ll report each check with pass criteria and failure-mode fixes, without applying any automatic changes.## Doctor-Style PATH/PIP Diagnosis (No Auto-Fix)

Use this exact order. For each check: **what to run**, **pass criterion**, **fix if failed**.

1. **Which `python`**
- **Run:** `which python` and `python -V`
- **Pass:** path is the interpreter you intend (project venv/conda/pyenv), and version matches project expectation.
- **Failure modes + fix:**
  - Points to system Python unexpectedly (e.g., `/usr/bin/python`) -> activate your env first (`source .venv/bin/activate`, `conda activate ...`, etc.).
  - Wrong pyenv/asdf shim resolution -> set local version (`pyenv local <ver>`) and reopen shell.

2. **Which `pip`**
- **Run:** `which pip` and `pip -V`
- **Pass:** `pip -V` shows it belongs to the *same interpreter* as step 1 (same env prefix).
- **Failure modes + fix:**
  - `pip` points to different Python than `python` -> stop using bare `pip`; use `python -m pip ...`.
  - Shell hash stale after env changes -> run `hash -r` (bash/zsh), then re-check.

3. **Interpreter/pip binding proof**
- **Run:** `python -m pip -V`
- **Pass:** output path matches `python`’s environment.
- **Failure modes + fix:**
  - Mismatch with `pip -V` -> enforce `python -m pip install -r requirements.txt` in docs/scripts/CI.
  - `No module named pip` -> bootstrap pip in that interpreter: `python -m ensurepip --upgrade` (or distro package manager if ensurepip unavailable).

4. **Active virtual environment state**
- **Run:** `echo "$VIRTUAL_ENV"` and `python -c "import sys; print(sys.prefix); print(sys.base_prefix)"`
- **Pass:** `VIRTUAL_ENV` is non-empty when expected; and in venv, `sys.prefix != sys.base_prefix`.
- **Failure modes + fix:**
  - `VIRTUAL_ENV` empty but project expects venv -> create/activate:
    - `python -m venv .venv`
    - `source .venv/bin/activate`
  - Nested/incorrect env activated -> `deactivate`, then activate the intended one.

5. **`PYTHONPATH` contamination**
- **Run:** `echo "$PYTHONPATH"`
- **Pass:** empty (or only intentionally set, project-approved paths).
- **Failure modes + fix:**
  - Global/custom paths force unexpected imports/site resolution -> unset for this shell: `unset PYTHONPATH`; remove from shell rc if unintended.

6. **User-site / global install behavior**
- **Run:**  
  - `python -c "import site; print(site.ENABLE_USER_SITE); print(site.getusersitepackages())"`  
  - `python -m pip config list`
- **Pass:** no unintended `--user` defaults or pip config that redirects install target.
- **Failure modes + fix:**
  - Pip config sets `user = true` or custom `target/prefix` -> remove or override in the relevant pip config file (`~/.config/pip/pip.conf`, etc.).
  - Permission errors causing fallback habits -> do installs inside env, not system Python.

7. **Final validation**
- **Run:**  
  - `python -m pip install -r requirements.txt`  
  - `python -m pip show <known-package>`
- **Pass:** package location is under the expected env’s `site-packages`.

---

## Recommended Safe Standard

Use this as policy in scripts/docs/CI:

- `python -m pip install -r requirements.txt`
- Never rely on bare `pip` in multi-Python systems.
- Activate env explicitly before installs.

---

## No-Destructive Auto-Fix Policy

- I do **not** auto-run destructive or state-changing fixes (no global uninstall, no deleting envs, no editing shell startup files automatically).
- I only report findings and recommend explicit commands.
- Any fix that changes interpreter selection, pip config, or environment activation should be user-confirmed first.

If you want, I can also provide a one-shot `doctor_python_pip.sh` script that runs these checks and prints PASS/FAIL with suggested remediations (read-only by default).