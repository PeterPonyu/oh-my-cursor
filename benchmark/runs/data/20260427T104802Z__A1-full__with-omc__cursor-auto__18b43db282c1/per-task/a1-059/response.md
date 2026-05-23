Use this **non-destructive, doctor-style runbook** for `CrashLoopBackOff` after deploy.

## CrashLoopBackOff Diagnosis (Ordered)

### 1) Pod status + events
- **Command (read-only):**
  - `kubectl get pod <pod> -n <ns> -o wide`
  - `kubectl describe pod <pod> -n <ns>`
- **What to look for:** `Last State`, `Exit Code`, `Reason`, event timeline (`Failed`, `Back-off`, `OOMKilled`, probe failures, mount errors).
- **Pass criterion:** Events show normal scheduling/startup; no repeating warning events causing restart.
- **Common failure modes + fix:**
  - `OOMKilled` → increase memory limit/request, reduce heap/cache, tune runtime memory flags.
  - `Error`/non-zero exit code → fix app startup command/config; roll forward with corrected image.
  - `FailedMount`/secret/configmap missing → restore/create referenced resource; correct names/namespace.
  - `Back-off restarting failed container` (symptom only) → continue checks 2–6 for root cause.

---

### 2) Container logs (current + previous)
- **Command (read-only):**
  - `kubectl logs <pod> -n <ns> -c <container> --tail=200`
  - `kubectl logs <pod> -n <ns> -c <container> --previous --tail=200`
- **Why both:** Current may be short/empty during fast restarts; `--previous` captures last crash.
- **Pass criterion:** App reaches steady startup without fatal exceptions/panic/exit.
- **Common failure modes + fix:**
  - Config/env missing (`KeyError`, `ENV not set`) → add required env vars / defaults.
  - DB/queue dependency timeout → verify endpoints/DNS/network policy/credentials; add startup retries.
  - Migration/boot script fails → fix script idempotency and permissions; separate one-off jobs from app boot.
  - Port binding mismatch → align app listen port with container/service/probe config.

---

### 3) Image pullability and image correctness
- **Command (mostly read-only):**
  - `kubectl describe pod <pod> -n <ns>` (check `Image`, pull events)
  - `kubectl get deploy <deploy> -n <ns> -o yaml | rg "image:|imagePullPolicy|imagePullSecrets"`
- **Pass criterion:** No `ErrImagePull`/`ImagePullBackOff`; expected tag/digest is deployed and pull auth works.
- **Common failure modes + fix:**
  - Wrong tag/digest → deploy correct immutable image digest.
  - Private registry auth failure → fix `imagePullSecrets` and service account linkage.
  - Architecture mismatch (`exec format error`) → publish multi-arch image or correct node selector.

> **Mutating check (flagged):** Re-running rollout/changing image (`kubectl set image`, `kubectl rollout restart`) mutates cluster state.

---

### 4) Env vars, ConfigMaps, Secrets presence and key mapping
- **Command (read-only):**
  - `kubectl get pod <pod> -n <ns> -o yaml | rg "env:|envFrom:|secretKeyRef|configMapKeyRef"`
  - `kubectl get secret <name> -n <ns> -o yaml`
  - `kubectl get configmap <name> -n <ns> -o yaml`
- **Pass criterion:** All referenced Secrets/ConfigMaps exist in same namespace; required keys exist; optional flags are intentional.
- **Common failure modes + fix:**
  - Missing object/key → create/fix Secret/ConfigMap and key names.
  - Wrong namespace/reference typo → correct manifest references.
  - Invalid decoded value format (URL, JSON, cert) → correct secret payload encoding/content.

> **Mutating check (flagged):** Creating/updating Secret/ConfigMap mutates cluster state.

---

### 5) Readiness vs liveness/startup probe correctness
- **Command (read-only):**
  - `kubectl get pod <pod> -n <ns> -o yaml | rg "livenessProbe|readinessProbe|startupProbe|path:|port:|initialDelaySeconds|timeoutSeconds|failureThreshold"`
  - `kubectl describe pod <pod> -n <ns>` (probe failure events)
- **Pass criterion:**
  - `livenessProbe` does **not** kill app during normal warm-up.
  - `readinessProbe` only gates traffic, does not cause restarts.
  - `startupProbe` exists for slow starters (or liveness delays are sufficient).
- **Common failure modes + fix:**
  - Liveness too aggressive on cold start → add `startupProbe` or increase `initialDelaySeconds`/`failureThreshold`.
  - Wrong probe path/port/scheme → match actual health endpoint and container port.
  - Probe command dependency missing (`exec` probe fails) → include required binary/script or switch to HTTP/TCP probe.

> **Mutating check (flagged):** Editing probe fields in Deployment/StatefulSet mutates cluster state.

---

### 6) Resources (requests/limits), throttling, node pressure
- **Command (read-only):**
  - `kubectl describe pod <pod> -n <ns>` (OOMKilled, QoS)
  - `kubectl top pod <pod> -n <ns>` and `kubectl top node <node>`
  - `kubectl get pod <pod> -n <ns> -o yaml | rg "resources:|requests:|limits:"`
- **Pass criterion:** No OOM kills; CPU not severely throttled during startup; requests/limits realistic for boot/runtime profile.
- **Common failure modes + fix:**
  - Memory limit too low → raise memory limit/request, reduce in-process memory.
  - CPU limit too low causing startup timeout/probe failures → raise CPU limit/request or relax probe timing.
  - Node memory pressure → reschedule/capacity plan, tune requests for better bin-packing.

> **Mutating check (flagged):** Changing requests/limits in workload spec mutates cluster state.

---

## Quick triage map (symptom → likely root cause)
- `Exit Code 137` / `OOMKilled` → memory limits/resources.
- Probe failures + restarts soon after start → liveness/startup probe config.
- `CreateContainerConfigError` → env/secret/configmap reference issues.
- `ErrImagePull`/`ImagePullBackOff` → image/registry auth.
- App stacktrace in `--previous` logs → app/config/runtime regression.

## Safe execution sequence (copy/paste)
```bash
kubectl get pod <pod> -n <ns> -o wide
kubectl describe pod <pod> -n <ns>
kubectl logs <pod> -n <ns> -c <container> --tail=200
kubectl logs <pod> -n <ns> -c <container> --previous --tail=200
kubectl get pod <pod> -n <ns> -o yaml
kubectl get deploy <deploy> -n <ns> -o yaml
kubectl top pod <pod> -n <ns>
```

If you share outputs from `describe` + both log commands, I can pinpoint the most likely root cause and give a minimal, low-risk fix plan.