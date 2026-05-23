## Doctor-Style Diagnosis for “`docker run` exits 0 with no logs”

Use this in order. It’s designed to be **safe by default** and clearly marks read-only vs state-changing checks.

### 1) Inspect image startup config (`Entrypoint` / `Cmd`)
- **Goal:** verify the image actually has a long-running startup command.
- **Command (read-only):**
  - `docker image inspect <image>:<tag> --format 'Entrypoint={{json .Config.Entrypoint}} Cmd={{json .Config.Cmd}}'`
- **Pass criterion:**
  - `Entrypoint` and/or `Cmd` resolves to a valid runtime command (not both empty, not shell wrapper that exits immediately).
- **Common failure mode:**
  - `Entrypoint=[]` and `Cmd=[]`, or command is one-shot (`echo`, `true`, script that ends).
- **Smallest fix:**
  - In Dockerfile, set a real startup:
    - `ENTRYPOINT ["your-server-binary"]`
    - or `CMD ["your-server-binary", "--serve"]`
  - If using script entrypoint, ensure script `exec`s the main process and does not terminate early.

---

### 2) Confirm final Dockerfile instructions and stage output
- **Goal:** ensure the final image stage didn’t accidentally drop startup instructions.
- **Command (read-only):**
  - `docker history --no-trunc <image>:<tag>`
- **Pass criterion:**
  - Final layers reflect expected `ENTRYPOINT`/`CMD` setup from the intended stage.
- **Common failure mode:**
  - Multi-stage build copies artifacts but final stage lacks `CMD`/`ENTRYPOINT`.
- **Smallest fix:**
  - Add `CMD`/`ENTRYPOINT` to the **final** stage explicitly (not just build stage).

---

### 3) Run with explicit logs + detached capture
- **Goal:** eliminate “no logs shown” due to run mode/flags.
- **Commands (state-changing: creates container):**
  - `docker run --name diag-test --rm <image>:<tag>`
  - If too fast, run detached then inspect:
    - `docker run -d --name diag-test <image>:<tag>`
    - `docker logs diag-test`
    - `docker inspect diag-test --format 'ExitCode={{.State.ExitCode}} Error={{.State.Error}} FinishedAt={{.State.FinishedAt}}'`
- **Pass criterion:**
  - Logs are visible and process remains running (or expected one-shot behavior is understood).
- **Common failure mode:**
  - Container exits before log flush / logging driver confusion / command is silent then exits.
- **Smallest fix:**
  - Keep it attached during diagnosis (`docker run -it ...`).
  - Ensure app writes to stdout/stderr (not only file logs).
  - For shell scripts, add explicit error handling + output (`set -eux`).

---

### 4) Verify foreground process behavior
- **Goal:** confirm PID 1 stays alive.
- **Commands (state-changing: runs container):**
  - `docker run --rm <image>:<tag> sh -lc 'ps -ef; echo "---"; <entry-command>'`
  - Or force interactive shell:
    - `docker run --rm -it --entrypoint sh <image>:<tag>`
- **Pass criterion:**
  - Main service runs as foreground PID 1 and does not daemonize/background itself.
- **Common failure mode:**
  - Startup script ends after launching daemon in background.
- **Smallest fix:**
  - Run service in foreground mode (e.g., `nginx -g "daemon off;"`, `python app.py` not `service ... start`).
  - In wrapper script, end with `exec "$@"`.

---

### 5) Validate entrypoint script integrity
- **Goal:** catch script-level silent exits.
- **Commands (read-only):**
  - `docker image inspect <image>:<tag> --format '{{json .Config.Entrypoint}}'`
  - If script path known, inspect in container:
    - `docker run --rm --entrypoint sh <image>:<tag> -lc 'ls -l /path/entrypoint.sh; sed -n "1,120p" /path/entrypoint.sh'`
- **Pass criterion:**
  - Script is executable, correct shebang, no premature `exit 0`, uses `exec`.
- **Common failure mode:**
  - Missing execute bit, wrong shebang, `exit 0` branch triggered, `set +e` masks failure.
- **Smallest fix:**
  - `RUN chmod +x /path/entrypoint.sh`
  - Correct shebang (`#!/bin/sh` or `#!/usr/bin/env bash`)
  - Replace trailing command with `exec ...`.

---

### 6) Check override behavior from compose / run args
- **Goal:** ensure runtime config isn’t replacing startup command.
- **Commands (read-only):**
  - `docker compose config` (if compose used)
  - Review `command:` and `entrypoint:` overrides.
- **Pass criterion:**
  - Runtime config matches intended image startup.
- **Common failure mode:**
  - Compose overrides command to a short task that exits 0.
- **Smallest fix:**
  - Remove/adjust override in compose file:
    - keep image defaults, or set proper long-running command.

---

## Read-only vs state-changing summary

- **Read-only checks:**
  - `docker image inspect ...`
  - `docker history ...`
  - `docker compose config`
  - script content/executable checks via non-mutating commands
- **State-changing checks (safe, non-destructive):**
  - `docker run ...` / `docker run -d ...` (creates/runs containers)
  - `docker logs <container>` (read-only itself, but depends on created container)
- **Not performed automatically:**
  - No `docker system prune`, no image/container deletion sweeps, no Dockerfile rewrites.

---

## Fast triage decision tree

1. `Entrypoint/Cmd` empty or one-shot? → fix Dockerfile startup command.  
2. Present but still exits 0 quickly? → inspect wrapper script, ensure `exec` + foreground process.  
3. No logs? → run attached / check logging path to stdout-stderr.  
4. Works with direct command but not normal run? → compose/runtime override mismatch.

If you want, I can turn this into a copy-paste “doctor script” (`bash`) that runs all **read-only** checks first, then prompts before each state-changing run step.