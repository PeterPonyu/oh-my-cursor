## CrashLoopBackOff Doctor Runbook (Non-Destructive)

Use this in order. Replace placeholders: `<ns>`, `<pod>`, `<container>`, `<deploy>`.

### 0) Scope and identify the failing container
- **Command (read-only):**
  - `kubectl -n <ns> get pod <pod> -o wide`
  - `kubectl -n <ns> describe pod <pod>`
- **Pass criterion:** You can identify which container is restarting and why (`Last State`, `Exit Code`, `Reason`).
- **If failed / unclear:** You’re troubleshooting blind.
- **Recommended fix:** Confirm correct namespace/pod and container names first; if multiple replicas, inspect at least one failing and one healthy pod for diff.

---

### 1) Pod events (first signal)
- **Command (read-only):**
  - `kubectl -n <ns> describe pod <pod>`
  - `kubectl -n <ns> get events --sort-by=.lastTimestamp | rg "<pod>|<deploy>"`
- **Pass criterion:** No repeated critical warnings (e.g., `Back-off restarting failed container`, `FailedMount`, `ErrImagePull`, probe failures).
- **Failure modes -> fix:**
  - `FailedMount` / secret or configmap not found -> create/fix referenced Secret/ConfigMap name/key and service account RBAC.
  - `ErrImagePull` / `ImagePullBackOff` -> verify image name/tag, registry auth (`imagePullSecrets`), and node egress.
  - Probe failures in events -> tune probe path/port/timing, or fix app startup/health endpoint.
- **Mutation risk:** None (read-only).

---

### 2) Container logs (current and previous)
- **Command (read-only):**
  - Current: `kubectl -n <ns> logs <pod> -c <container> --tail=200`
  - Previous crash: `kubectl -n <ns> logs <pod> -c <container> --previous --tail=200`
- **Pass criterion:** App starts cleanly, no fatal exits/panics, no immediate OOM/permission/config errors.
- **Failure modes -> fix:**
  - App exits with config/env error -> fix env var or config source.
  - DB/queue connection refused/timeouts -> verify service DNS, network policy, credentials, dependency readiness.
  - `OOMKilled` patterns -> raise memory limit/request or reduce heap; set runtime memory flags.
  - Permission/file access denied -> fix `securityContext`, filesystem mounts, UID/GID, read-only FS paths.
- **Mutation risk:** None (read-only).

---

### 3) Image pullability and runtime image correctness
- **Command (read-only):**
  - `kubectl -n <ns> get pod <pod> -o jsonpath='{.spec.containers[*].image}{"\n"}{.status.containerStatuses[*].imageID}{"\n"}'`
  - `kubectl -n <ns> describe pod <pod> | rg "Image:|Image ID:|ErrImagePull|ImagePullBackOff"`
- **Pass criterion:** Image resolves successfully; `imageID` present; no pull errors.
- **Failure modes -> fix:**
  - Tag typo/nonexistent image -> correct image reference in Deployment and redeploy.
  - Private registry unauthorized -> fix `imagePullSecrets` and registry credentials.
  - Mutable tag drift (`latest`) causing unexpected binary -> pin immutable digest/tag.
- **Mutation risk:** None for checks; fixing deployment/image is mutating.

---

### 4) Env vars / ConfigMap / Secret presence and key integrity
- **Command (read-only):**
  - `kubectl -n <ns> get pod <pod> -o yaml | rg "env:|envFrom:|secretKeyRef:|configMapKeyRef:" -n`
  - `kubectl -n <ns> get secret <name> -o yaml` (metadata/key existence only)
  - `kubectl -n <ns> get configmap <name> -o yaml`
- **Pass criterion:** Every referenced Secret/ConfigMap and key exists; expected envs are populated.
- **Failure modes -> fix:**
  - Missing object/key -> create missing secret/config key or update references.
  - Wrong key names/case -> align Deployment refs with actual keys.
  - Empty decoded values / bad formatting -> correct secret payload encoding and app parsing.
- **Mutation risk:** Check commands are read-only; creating/updating secret/config is mutating.

---

### 5) Readiness vs liveness probe correctness
- **Command (read-only):**
  - `kubectl -n <ns> get pod <pod> -o jsonpath='{.spec.containers[?(@.name=="<container>")].readinessProbe}{"\n"}{.spec.containers[?(@.name=="<container>")].livenessProbe}{"\n"}{.spec.containers[?(@.name=="<container>")].startupProbe}{"\n"}'`
  - `kubectl -n <ns> describe pod <pod> | rg "Readiness|Liveness|Startup|probe failed" -n`
- **Pass criterion:**  
  - `startupProbe` exists for slow starters (preferred),  
  - `livenessProbe` is not killing app before startup,  
  - `readinessProbe` matches actual ready endpoint/port.
- **Failure modes -> fix:**
  - Liveness firing too early -> add/increase `startupProbe`, increase `initialDelaySeconds`/`failureThreshold`.
  - Wrong path/port/scheme -> correct probe endpoint and named port mapping.
  - Readiness too strict causing no traffic (but not restart) -> relax thresholds or fix app dependencies.
- **Mutation risk:** None for diagnosis; changing probe config is mutating.

---

### 6) Resource requests/limits and node pressure
- **Command (read-only):**
  - `kubectl -n <ns> describe pod <pod> | rg "Limits:|Requests:|OOMKilled|Evicted" -n`
  - `kubectl top pod -n <ns> <pod>` (if metrics-server available)
  - `kubectl describe node <node-name> | rg "MemoryPressure|DiskPressure|PIDPressure|Allocatable|Allocated resources" -n`
- **Pass criterion:** No `OOMKilled`, no eviction pressure, usage fits limits/requests with headroom.
- **Failure modes -> fix:**
  - `OOMKilled` -> increase memory limit/request; tune JVM/Node/Python memory settings.
  - CPU throttling/startup timeout -> raise CPU request/limit or increase probe timeouts.
  - Node pressure/eviction -> rebalance workloads, increase cluster capacity, adjust requests.
- **Mutation risk:** None for checks; scaling/changing resources is mutating.

---

## Optional deep checks (some can mutate)
- `kubectl debug` ephemeral container, or launching a test pod to curl endpoints:
  - **Useful for:** DNS, network policy, service reachability from same namespace.
  - **Mutation risk:** **Yes (mutates cluster state)** — creates ephemeral/debug workload.
- Rollout actions (`rollout restart`, rollback):
  - **Mutation risk:** **Yes (mutates cluster state)**.

---

## Fast triage mapping (symptom -> likely root cause)
- `ExitCode 1` immediately + config errors in `--previous` logs -> env/config/secret mismatch.
- `OOMKilled` -> memory limits too low.
- `ImagePullBackOff` -> image/tag/registry auth.
- Repeated `Liveness probe failed` before app ready -> probe misconfiguration/startup timing.
- `FailedMount` -> missing Secret/ConfigMap/PVC or RBAC issue.

If you want, I can turn this into a copy-paste bash checklist that prints PASS/FAIL per check (read-only mode by default, and explicit warnings before any mutating command).