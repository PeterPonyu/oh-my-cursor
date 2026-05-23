I’ll run a structured, non-destructive diagnosis in this repo: first I’ll inspect the Docker build/run configuration and then execute read-only runtime checks to pinpoint why containers exit cleanly with no logs.I confirmed the installed “doctor” skill is specific to oh-my-codex installation health, so I’m proceeding with a custom Docker doctor workflow tailored to your failure pattern. I’ll locate Docker artifacts and run read-only checks first.I can’t execute Docker commands in this session (`docker ...` is blocked here), so I can’t directly inspect your daemon.  
Below is a **doctor-style runbook** you can execute locally, in order, with pass criteria, minimal fix, and whether each check is read-only or state-changing.

## Docker Exit-0 Doctor Checklist

### 1) Image startup contract: `ENTRYPOINT` + `CMD`
- **Command (read-only):**
  - `docker image inspect <image>:<tag> --format 'Entrypoint={{json .Config.Entrypoint}} Cmd={{json .Config.Cmd}}'`
- **Pass criterion:** At least one of `Entrypoint` or `Cmd` resolves to a long-running process for your app.
- **Common failure mode:** Both are empty, or they resolve to a one-shot command (`echo`, short script, setup task).
- **Smallest fix:** Set an explicit runtime command in `Dockerfile`:
  - `ENTRYPOINT ["your-server-binary"]`
  - and/or `CMD ["--serve"]`
  - (or override at run time once: `docker run <image> <long-running-cmd>`)

### 2) Foreground-process check (PID 1 behavior)
- **Command (state-changing: creates a test container):**
  - `docker run --rm --name doctor-fg <image>:<tag>`
- **Pass criterion:** Container stays attached/running (or shows expected startup logs and keeps running).
- **Failure mode:** Container exits immediately with code 0.
- **Smallest fix:** Ensure PID 1 is the service process, not a wrapper that backgrounds and exits.
  - If shell script entrypoint, end with `exec your-server ...`
  - Remove backgrounding (`&`, `nohup`) in startup script.

### 3) Shell/entrypoint script correctness
- **Command (read-only):**
  - `docker image inspect <image>:<tag> --format '{{json .Config.Entrypoint}}'`
  - If script-based, inspect script in repo/image source.
- **Pass criterion:** Script has valid shebang, executable bit, and `exec` for final process.
- **Failure mode:** Script runs setup then exits 0; missing `exec`; wrong script target.
- **Smallest fix:** Minimal patch:
  - `#!/bin/sh`
  - `set -e`
  - `exec <actual-long-running-process> "$@"`

### 4) Container logs visibility flags
- **Command (state-changing for test run + read-only log retrieval):**
  - `docker run --name doctor-log <image>:<tag>`
  - `docker logs doctor-log`
  - `docker rm doctor-log`
- **Pass criterion:** Expected startup output appears (or intentional silence with running process).
- **Failure mode:** No logs because app logs to file/syslog or detached process exits.
- **Smallest fix:** Log to stdout/stderr in foreground process; avoid daemonizing.
  - Runtime debug variant: `docker run --rm -it <image>:<tag>`

### 5) Layer history sanity (what actually got baked)
- **Command (read-only):**
  - `docker history --no-trunc <image>:<tag>`
- **Pass criterion:** Final layers reflect expected runtime command/script copy and permissions.
- **Failure mode:** Last layers overwrite entrypoint/script unexpectedly, or copy wrong file.
- **Smallest fix:** Adjust only final Dockerfile lines (copy path, chmod, ENTRYPOINT/CMD order) and rebuild.

### 6) Effective command after overrides
- **Command (read-only inspect + state-changing test):**
  - Inspect run command you actually use (compose/CI wrapper).
  - `docker inspect <container> --format 'Path={{.Path}} Args={{json .Args}}'` (after one test run)
- **Pass criterion:** Effective `Path`/`Args` match intended server command.
- **Failure mode:** `docker run ... <override>` or compose `command:` unintentionally replaces CMD.
- **Smallest fix:** Remove accidental override or set correct `command:`/`entrypoint:` in one place only.

## Quick Triage Decision Tree
- **Exits 0 + no logs + empty Entrypoint/Cmd** -> set explicit `CMD`/`ENTRYPOINT`.
- **Exits 0 + script entrypoint** -> add `exec` and remove backgrounding.
- **Runs only with manual command** -> Dockerfile default command is wrong.
- **History shows wrong final copy/chmod** -> fix final Dockerfile layering.

## Read-only vs state-changing summary
- **Read-only checks:** image inspect, history, container inspect (existing container), Dockerfile/script review.
- **State-changing checks:** any `docker run` (creates/starts container), explicit cleanup `docker rm` (non-destructive cleanup only).

If you share your `Dockerfile` and exact `docker run` command, I can map this checklist to your case and give the minimum exact patch.