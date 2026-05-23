Use this **non-destructive, doctor-style runbook** in order. It’s optimized for `CrashLoopBackOff` after deploy.

Assume:
- namespace: `NAMESPACE`
- pod: `POD`
- container: `CONTAINER` (if multi-container pod)

---

## 0) Confirm Scope / Baseline

**Command**
- `kubectl get pod -n NAMESPACE POD -o wide`
- `kubectl get pod -n NAMESPACE POD -o jsonpath='{.status.containerStatuses[*].name}{"\n"}{.status.containerStatuses[*].restartCount}{"\n"}{.status.containerStatuses[*].state}{"\n"}'`

**Pass criterion**
- You can identify the crashing container, restart count, and current wait reason (`CrashLoopBackOff`).

**Failure mode**
- Wrong pod/container targeted; symptoms unclear.

**Recommended fix**
- Pick exact failing container first; repeat all checks per failing container.

**Mutation risk**
- None (read-only).

---

## 1) Pod Events (Scheduling / image / probe / OOM clues)

**Command**
- `kubectl describe pod -n NAMESPACE POD`
- `kubectl get events -n NAMESPACE --sort-by=.lastTimestamp | rg "POD|BackOff|Failed|Killing|Unhealthy|Pulled|Pulling|OOM|probe"`

**Pass criterion**
- No repeating `Warning` events tied to pod/container.
- No `Failed`, `BackOff`, `Unhealthy`, `OOMKilled`, `FailedMount`, `ImagePullBackOff`.

**Failure modes → recommended fix**
- `Back-off restarting failed container` → app exits quickly; proceed to logs/probes.
- `OOMKilled` or `Killing` due to memory → raise memory limit/request, tune JVM/Node heap, reduce startup memory spike.
- `Unhealthy` probe failures → adjust probe config (see check 5).
- `FailedMount` secret/configmap not found → create/fix missing dependency names.
- `ImagePullBackOff`/`ErrImagePull` → see check 3.

**Mutation risk**
- None (read-only).

---

## 2) Container Logs (current + previous) — most important

**Command**
- Current instance: `kubectl logs -n NAMESPACE POD -c CONTAINER --tail=200`
- Previous crashed instance: `kubectl logs -n NAMESPACE POD -c CONTAINER --previous --tail=200`
- If noisy, add timestamps: `--timestamps`

**Pass criterion**
- Startup succeeds; no fatal exceptions/panics; process stays up beyond probe initial delay.

**Failure modes → recommended fix**
- Immediate crash with stack trace/config error → fix app config/flags/env mismatch introduced by deploy.
- Dependency connection failure (DB/Redis/API) → fix endpoint, DNS, network policy, credentials.
- Permission denied / file not found → align image user/fs paths/volume mounts.
- Exit code 0 repeatedly (job-like app in Deployment) → use `Job`/`CronJob` or run a long-lived process for Deployment.
- Nothing logged → process dies before logger init; inspect command/entrypoint and events.

**Mutation risk**
- None (read-only).

---

## 3) Image Pullability & Image Reference Integrity

**Command**
- `kubectl get pod -n NAMESPACE POD -o jsonpath='{.spec.containers[?(@.name=="CONTAINER")].image}{"\n"}'`
- `kubectl describe pod -n NAMESPACE POD | rg "Image:|Image ID:|Pulling|Pulled|Failed to pull|ErrImagePull|ImagePullBackOff"`
- `kubectl get sa -n NAMESPACE $(kubectl get pod -n NAMESPACE POD -o jsonpath='{.spec.serviceAccountName}') -o yaml | rg "imagePullSecrets|name:"`

**Pass criterion**
- Image pulls successfully; no auth/tag/manifest errors.
- Image tag/digest matches expected release artifact.

**Failure modes → recommended fix**
- `manifest unknown` / bad tag → deploy correct tag/digest.
- auth denied → add/fix `imagePullSecrets` on ServiceAccount or Pod spec.
- wrong architecture (`exec format error`) → publish multi-arch image or correct node selector/affinity.

**Mutation risk**
- None for above checks (read-only).  
- Creating/updating pull secrets **would mutate cluster state**.

---

## 4) Env Vars, ConfigMaps, Secrets Presence/keys

**Command**
- Pod env refs:  
  `kubectl get pod -n NAMESPACE POD -o yaml | rg "env:|envFrom:|secretKeyRef:|configMapKeyRef:|name:|key:"`
- Validate referenced objects exist:  
  `kubectl get secret -n NAMESPACE SECRET_NAME -o yaml`  
  `kubectl get configmap -n NAMESPACE CM_NAME -o yaml`
- Optional key existence check:  
  `kubectl get secret -n NAMESPACE SECRET_NAME -o jsonpath='{.data}'`

**Pass criterion**
- All referenced Secrets/ConfigMaps exist.
- Required keys are present and non-empty (after decode in app context).
- No typo mismatch in names/keys.

**Failure modes → recommended fix**
- Missing secret/configmap → create it or fix reference name.
- Missing key in existing secret/configmap → add key and redeploy/restart.
- Bad value format (URL, JSON, cert) → correct data format and roll out.

**Mutation risk**
- Reads are non-mutating.  
- Creating/updating secrets/configmaps **would mutate cluster state**.

---

## 5) Readiness vs Liveness Probe Correctness

**Command**
- `kubectl get pod -n NAMESPACE POD -o jsonpath='{.spec.containers[?(@.name=="CONTAINER")].livenessProbe}{"\n"}{.spec.containers[?(@.name=="CONTAINER")].readinessProbe}{"\n"}{.spec.containers[?(@.name=="CONTAINER")].startupProbe}{"\n"}'`
- `kubectl describe pod -n NAMESPACE POD | rg "Liveness|Readiness|Startup|probe|Unhealthy|failed"`

**Pass criterion**
- `startupProbe` exists for slow-start apps (recommended).
- `livenessProbe` does not fire before app can initialize.
- Probe path/port/protocol/command matches actual app behavior.
- Failures are occasional, not continuous.

**Failure modes → recommended fix**
- Liveness kills app during startup → add `startupProbe`, increase `initialDelaySeconds`/`failureThreshold`.
- Wrong endpoint/port/scheme → correct probe target (`/healthz`, correct containerPort, HTTP vs HTTPS).
- Probe timeout too strict → increase `timeoutSeconds` and maybe `periodSeconds`.
- Readiness failing only → service won’t route, but should not crash; still fix endpoint/dependencies.

**Mutation risk**
- Inspecting is read-only.  
- Editing probe config in Deployment/Helm values **would mutate cluster state**.

---

## 6) Resource Requests/Limits & Runtime Exhaustion

**Command**
- Resource spec:  
  `kubectl get pod -n NAMESPACE POD -o jsonpath='{.spec.containers[?(@.name=="CONTAINER")].resources}{"\n"}'`
- Termination reason/exit code:  
  `kubectl get pod -n NAMESPACE POD -o jsonpath='{.status.containerStatuses[?(@.name=="CONTAINER")].lastState.terminated.reason}{" "}{.status.containerStatuses[?(@.name=="CONTAINER")].lastState.terminated.exitCode}{"\n"}'`
- If metrics-server available:  
  `kubectl top pod -n NAMESPACE POD --containers`

**Pass criterion**
- No `OOMKilled`; memory/CPU usage not constantly pegged at limits.
- Requests/limits are realistic for startup and steady state.

**Failure modes → recommended fix**
- `OOMKilled` + high memory → raise memory limit/request; tune app memory flags.
- CPU starvation/startup timeout → increase CPU request/limit; relax startup/probe thresholds.
- Evictions/node pressure signals → review node capacity, pod QoS, and scheduling constraints.

**Mutation risk**
- Reads are non-mutating.  
- Changing requests/limits **would mutate cluster state**.

---

## 7) Optional sanity checks (still read-only)

- Compare ReplicaSet revision image/env/probe drift:  
  `kubectl rollout history deploy/DEPLOY -n NAMESPACE`
- Confirm command/args:  
  `kubectl get pod -n NAMESPACE POD -o jsonpath='{.spec.containers[?(@.name=="CONTAINER")].command}{" "}{.spec.containers[?(@.name=="CONTAINER")].args}{"\n"}'`

**Mutation risk**
- None (read-only).

---

## Quick Triage Mapping (symptom → likely root cause)

- `CrashLoopBackOff` + clean `ErrImagePull` events → image/auth/tag issue.
- `CrashLoopBackOff` + app stacktrace in `--previous` logs → app/config regression.
- `CrashLoopBackOff` + `OOMKilled` → memory limit too low or memory leak/spike.
- `Unhealthy (Liveness probe failed)` before startup completes → probe misconfiguration.
- `FailedMount`/missing secret/configmap → env dependency missing.

---

If you want, I can turn this into a copy-paste shell script that runs all **read-only** checks and prints a structured diagnosis report (no `apply`, no restart, no patch).