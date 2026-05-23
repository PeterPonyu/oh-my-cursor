Use this **doctor-style runbook** in order. It’s designed for the exact symptom: **`docker build` OK, `docker run` exits 0 instantly, no logs**.

## 1) Inspect image startup config (ENTRYPOINT/CMD)  
**Goal:** Verify the container is configured to launch a real long-running process.

- **Read-only check:**  
  ```bash
  docker image inspect <image> --format 'Entrypoint={{json .Config.Entrypoint}} Cmd={{json .Config.Cmd}}'
  ```
- **Pass criterion:**  
  - `Entrypoint` and/or `Cmd` resolves to a valid executable, and intended runtime behavior is clear.
  - Not empty in a way that causes immediate shell exit.
- **Common failure modes:**  
  - `Entrypoint=[]` and `Cmd=[]` (or effectively no command).
  - `Cmd` is something short-lived (`echo`, script that ends immediately).
  - Shell-form entrypoint that returns immediately.
- **Smallest non-destructive fix:**  
  - Run with explicit command to confirm behavior:
    ```bash
    docker run --rm -it <image> sh
    ```
    or
    ```bash
    docker run --rm <image> <expected-server-command>
    ```
  - Then permanently fix Dockerfile `ENTRYPOINT`/`CMD` (minimal edit only).

---

## 2) Check what command actually ran in the exited container  
**Goal:** Confirm final launch command and exit code from runtime metadata.

- **Read-only check:**  
  ```bash
  docker ps -a --no-trunc --filter ancestor=<image>
  docker inspect <container_id> --format 'Path={{.Path}} Args={{json .Args}} Exit={{.State.ExitCode}} Error={{.State.Error}}'
  ```
- **Pass criterion:**  
  - `Path`/`Args` match expected app process.
  - Exit code behavior matches app design (for services, it should typically keep running).
- **Failure modes:**  
  - Path/Args show a one-shot command.
  - Exit 0 with empty `Error` indicates “cleanly completed” (not a crash).
- **Smallest fix:**  
  - Start with correct runtime command override:
    ```bash
    docker run --rm <image> <correct long-running command>
    ```
  - Apply same command to Dockerfile `CMD` once verified.

---

## 3) Validate logs retrieval method (container vs run flags)  
**Goal:** Ensure “no logs” isn’t just from using auto-remove or detached mode incorrectly.

- **Read-only check:**  
  - If you used `--rm`, logs can disappear after exit. Re-run **without** `--rm`:
    ```bash
    docker run --name diag-test <image>
    docker logs diag-test
    ```
  - Or in foreground:
    ```bash
    docker run -it --name diag-test <image>
    ```
- **Pass criterion:**  
  - You can retrieve logs for the exited container.
- **Failure modes:**  
  - `--rm` deletes container before inspection.
  - App logs to file only, not stdout/stderr.
- **Smallest fix:**  
  - Drop `--rm` during diagnosis.
  - Configure app logging to stdout/stderr (minimal app config change).

> Note: `docker run --name diag-test ...` **changes state** (creates container), but is non-destructive.

---

## 4) Verify foreground process behavior (PID 1 lifecycle)  
**Goal:** Confirm PID 1 stays alive; if it exits, container exits.

- **Read-only-ish diagnostic run (creates ephemeral container):**  
  ```bash
  docker run --rm -it --entrypoint sh <image> -lc 'ps -ef; echo "---"; <your-start-command>; echo "exit=$?"'
  ```
- **Pass criterion:**  
  - Main process is long-running and remains in foreground.
- **Failure modes:**  
  - Startup script backgrounds service (`&`) then exits.
  - Uses daemon mode (`-d`, `--daemonize`) inside container.
  - Wrapper script ends without `exec`.
- **Smallest fix:**  
  - Remove daemonization flags.
  - In wrapper script, end with:
    ```sh
    exec <main-process>
    ```
  - Ensure one foreground process remains as PID 1.

---

## 5) Review image layer history for accidental startup overrides  
**Goal:** Find last layer that changed `CMD`, `ENTRYPOINT`, shell, or startup scripts.

- **Read-only check:**  
  ```bash
  docker history --no-trunc <image>
  ```
  and compare Dockerfile tail:
  - Late `CMD`/`ENTRYPOINT` override
  - `SHELL` changes
  - `COPY` of entrypoint script with wrong content/permissions
- **Pass criterion:**  
  - Final layers align with intended startup contract.
- **Failure modes:**  
  - Final stage resets `CMD` unintentionally.
  - Wrong script copied in multi-stage build.
- **Smallest fix:**  
  - Move correct `ENTRYPOINT`/`CMD` to final stage.
  - Correct `COPY` target/script path only.

---

## 6) Quick permission/shebang sanity for entrypoint scripts  
**Goal:** Ensure script can execute and has valid interpreter line.

- **Read-only check (image filesystem introspection via ephemeral container):**  
  ```bash
  docker run --rm --entrypoint sh <image> -lc 'ls -l /path/to/entrypoint.sh; sed -n "1p" /path/to/entrypoint.sh'
  ```
- **Pass criterion:**  
  - Script is executable and shebang is valid (e.g., `#!/bin/sh`), line endings are LF.
- **Failure modes:**  
  - Not executable.
  - CRLF line endings causing silent odd behavior in some cases.
- **Smallest fix:**  
  - Dockerfile minimal patch:
    ```Dockerfile
    RUN chmod +x /path/to/entrypoint.sh
    ```
  - Normalize line endings in script.

---

## Read-only vs state-changing classification

- **Read-only checks:**  
  - `docker image inspect`  
  - `docker inspect` (existing container)  
  - `docker history`  
  - `docker logs` (existing container)  

- **State-changing but non-destructive checks:**  
  - `docker run ...` (creates/runs containers)  
  - `docker run --name ...` for reproducible inspection  
  - `docker run --rm ...` (ephemeral container creation/removal)

- **Potentially state-changing fixes (manual, smallest change):**  
  - Editing Dockerfile/script  
  - Rebuilding image  
  - Re-running container with corrected command

---

If you want, I can turn this into a **copy-paste “doctor script”** that runs all read-only checks first, then gated runtime checks, and prints PASS/FAIL per item.