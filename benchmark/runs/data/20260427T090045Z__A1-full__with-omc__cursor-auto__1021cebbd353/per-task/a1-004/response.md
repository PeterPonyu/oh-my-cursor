## Phased Migration Plan: VM -> Kubernetes + HPA (Stateless Node.js API)

### Phase 0: Baseline & Readiness (No traffic change)
- **Goal**: prove the current service is safe to containerize and autoscale.
- **Scope (files/assets)**  
  - `README` / runbook: startup, env vars, ports, health behavior  
  - app config: ensure all state is external (DB/Redis/object store), no local disk dependence  
  - metrics/logging config: request latency, error rate, CPU/memory
- **Key actions**
  - Define SLOs and migration success criteria (p95 latency, error budget, availability).
  - Add/verify health endpoints (`/healthz`, `/readyz`) and graceful shutdown.
  - Verify idempotency and safe retries for in-flight requests.
- **Risks**
  - Hidden local state (tmp files, local cache/session).
  - Missing readiness causes bad rollouts.
- **Rollback**
  - No prod routing change yet; rollback is simply stopping migration work and keeping VM as source of truth.

---

### Phase 1: Containerization (Artifact parity)
- **Goal**: produce a production-grade image that behaves like VM runtime.
- **Scope (files/assets)**
  - `Dockerfile` (multi-stage build, non-root user, slim runtime image)
  - `.dockerignore`
  - Optional: `entrypoint.sh` for signal handling/startup checks
  - Dependency lockfile (`package-lock.json` / `pnpm-lock.yaml`) for reproducibility
- **Key actions**
  - Build immutable image with pinned base image.
  - Run as non-root; expose API port; set `NODE_ENV=production`.
  - Add `HEALTHCHECK` (if desired at image level; K8s probes remain primary).
- **Risks**
  - Native module build mismatch between VM and container OS.
  - Bloated image or slow startup affects autoscaling.
- **Rollback**
  - Keep VM deployment pipeline untouched.
  - If container fails parity tests, block promotion and continue VM releases only.

---

### Phase 2: Kubernetes Foundation (Single replica, non-prod)
- **Goal**: deploy in cluster with stable baseline before autoscaling.
- **Scope (files/assets)**
  - `k8s/namespace.yaml`
  - `k8s/deployment.yaml` (replicas=1, resource requests/limits, probes)
  - `k8s/service.yaml` (ClusterIP)
  - `k8s/configmap.yaml`, `k8s/secret.yaml` (or ExternalSecret references)
  - `k8s/ingress.yaml` (if exposed externally)
  - Optional overlays: `k8s/overlays/dev`, `k8s/overlays/staging`
- **Key actions**
  - Deploy to dev/staging first; verify readiness/liveness behavior.
  - Set conservative CPU/memory requests based on VM baseline.
  - Validate observability (logs/metrics/traces) from pod level.
- **Risks**
  - Wrong resource requests -> throttling/OOM.
  - Misconfigured secrets/config causing startup loops.
- **Rollback**
  - `kubectl rollout undo deployment/<api>` in non-prod.
  - Keep VM prod path untouched; no customer impact.

---

### Phase 3: CI/CD Integration (Build once, deploy safely)
- **Goal**: make image build + manifest deployment repeatable and promotion-based.
- **Scope (files/assets)**
  - CI pipeline file (e.g. `.github/workflows/deploy.yml` or `gitlab-ci.yml`)
  - Registry publish step (tag by commit SHA + semver)
  - Manifest render/apply step (Helm/Kustomize/plain `kubectl`)
  - Policy checks (lint, vulnerability scan, manifest validation)
- **Key actions**
  - Build once, promote same image across envs.
  - Add deployment gates: tests, scan severity threshold, manual approval for prod.
  - Store deployment metadata (image digest, release notes).
- **Risks**
  - Tag drift (`latest`) leading to non-reproducible deploys.
  - CI credentials/secrets mismanagement.
- **Rollback**
  - Redeploy previous known-good image digest via CI.
  - Freeze pipeline on failure; continue serving from VM/prod current path.

---

### Phase 4: Production Cutover (Canary from VM to K8s)
- **Goal**: shift traffic gradually with measurable safety checks.
- **Scope (files/assets)**
  - Ingress/LB routing config (weighted split if supported)
  - `k8s/deployment.yaml` (replicas >=2 for HA in prod)
  - Runbooks: cutover checklist + incident rollback doc
- **Key actions**
  - Start 5% traffic to K8s, then 25% -> 50% -> 100% by error/latency gates.
  - Monitor p95/p99 latency, 5xx, saturation, restart rate.
  - Validate downstream dependency load (DB connections, Redis pool sizing).
- **Risks**
  - Connection storms during scale-up.
  - Behavioral differences under concurrent load.
- **Rollback**
  - Immediate traffic weight back to VM (0% K8s).
  - Keep K8s deployment running for debugging or scale to zero if needed.

---

### Phase 5: Enable HPA (Controlled autoscaling)
- **Goal**: autoscale safely after stable baseline in prod.
- **Scope (files/assets)**
  - `k8s/hpa.yaml` (CPU and/or custom metrics)
  - Optional: `k8s/pdb.yaml` (PodDisruptionBudget)
  - Optional: `k8s/vpa.yaml` (recommendation mode) or tuning doc
- **Key actions**
  - Start with conservative bounds (`minReplicas`, `maxReplicas`) and stabilization windows.
  - Prefer mixed signals (CPU + request rate/latency custom metrics) if available.
  - Tune requests/limits to avoid HPA fighting throttling.
- **Risks**
  - Flapping due to noisy metrics.
  - Scale-to-max causing downstream saturation/cost spikes.
- **Rollback**
  - Disable or pin HPA (set fixed replicas).
  - Revert to known stable replica count and previous resource settings.

---

### Phase 6: Decommission VM (After soak period)
- **Goal**: remove old infra only after confidence window.
- **Scope (files/assets)**
  - Infra-as-code for VM teardown
  - DNS/LB finalization docs
  - Cost/ops documentation updates
- **Key actions**
  - Run 1-2 week soak at 100% K8s.
  - Archive VM rollback image/snapshot for defined retention period.
  - Remove VM from active rotation, then deprovision.
- **Risks**
  - Premature teardown removes safety net.
- **Rollback**
  - Reintroduce VM target from snapshot/image within retention window.
  - Restore previous routing policy.

---

## Recommended Asset Layout (example)
- `Dockerfile`, `.dockerignore`
- `k8s/base/{deployment,service,configmap,secret,hpa}.yaml`
- `k8s/overlays/{dev,staging,prod}/kustomization.yaml`
- `.github/workflows/{ci,cd}.yml` (or equivalent CI system)
- `docs/runbooks/{deploy,rollback,cutover}.md`

---

## Migration Gates (use at every phase)
- **Functional**: health checks, smoke tests, backward-compatible API behavior.
- **Reliability**: no regression in 5xx, latency, restart/OOM.
- **Scalability**: load test at expected and 2x peak.
- **Operability**: logs/metrics/traces and rollback runbook validated.

If you want, I can turn this into a concrete implementation checklist for your stack (GitHub Actions vs GitLab, Helm vs Kustomize, EKS/GKE/AKS), including starter `Dockerfile`, `Deployment`, and `HPA` templates.