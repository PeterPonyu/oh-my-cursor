I’ll draft this as a practical, phase-by-phase migration runbook with explicit scope, risks, and rollback criteria for each phase, tailored to a stateless Node.js API moving from a VM to Kubernetes with HPA. I’m quickly checking the planning skill guidance first to align structure.## Phased Migration Plan (VM -> Kubernetes + HPA)

### Assumptions
- API is stateless (no local session/files), externalizes DB/cache/queue.
- Zero-downtime is required.
- Existing VM deployment remains available as fallback until final cutover.

---

### Phase 0 - Readiness and Baseline

**Goal:** Make behavior measurable before platform change.

- **Scope / assets**
  - `README` / runbook: document current deploy/startup/healthcheck behavior.
  - App config: ensure `PORT`, `NODE_ENV`, dependency endpoints are env-driven.
  - Add/confirm health endpoints (`/healthz`, `/readyz`) in app.
  - Define SLOs and baseline: p95 latency, error rate, CPU/memory, RPS.
- **Risks**
  - Hidden statefulness (tmp files, in-memory sessions).
  - Missing readiness checks causes bad rollout behavior later.
- **Rollback**
  - No traffic changes yet; rollback is just reverting readiness/config edits.

---

### Phase 1 - Containerization (Dockerfile + local validation)

**Goal:** Produce a production-safe image.

- **Scope / assets**
  - `Dockerfile` (multi-stage build, non-root user, minimal runtime image).
  - `.dockerignore` to keep image small and avoid secrets.
  - Optional: `docker-compose.yml` for local dependency smoke tests.
  - Add startup command and container healthcheck alignment with app endpoints.
- **Risks**
  - Runtime mismatch (native modules, Node version drift).
  - Large image / slow startup, missing OS libs.
- **Rollback**
  - Continue deploying VM artifact as primary.
  - Revert image changes; no production traffic on K8s yet.

---

### Phase 2 - Kubernetes Foundations (manifests, no production traffic)

**Goal:** Deploy app into cluster safely without serving user traffic.

- **Scope / assets**
  - `k8s/namespace.yaml`
  - `k8s/deployment.yaml` (resources, probes, rolling strategy, anti-affinity optional)
  - `k8s/service.yaml` (ClusterIP)
  - `k8s/configmap.yaml` + `k8s/secret` strategy (or external secret manager)
  - `k8s/pdb.yaml` (PodDisruptionBudget)
  - `k8s/networkpolicy.yaml` (if cluster supports it)
- **Risks**
  - Bad probe tuning causing restart loops.
  - Under/over-provisioned requests/limits destabilizing scheduling.
- **Rollback**
  - `kubectl rollout undo deployment/<api>`
  - Scale K8s deployment to 0 and keep VM path active.

---

### Phase 3 - CI/CD Enablement (build, scan, deploy to non-prod)

**Goal:** Automate repeatable image + manifest delivery.

- **Scope / assets**
  - CI pipeline file (e.g., `.github/workflows/deploy.yml` / `gitlab-ci.yml` / `Jenkinsfile`):
    - lint/test
    - build image
    - security scan (image + deps)
    - push image tag
    - deploy to dev/staging namespace
  - Manifest templating strategy (Helm or Kustomize):
    - `charts/api/*` or `k8s/overlays/{dev,staging,prod}`
- **Risks**
  - Tag drift (`latest`) and non-reproducible deploys.
  - Secrets leakage in CI logs.
- **Rollback**
  - Re-run pipeline with prior known-good image tag.
  - Pin deploy to previous manifest/chart version.

---

### Phase 4 - Introduce HPA in Staging (tuning phase)

**Goal:** Validate autoscaling behavior before production.

- **Scope / assets**
  - `k8s/hpa.yaml` (min/max replicas, target CPU and/or memory; optionally custom metrics)
  - Ensure Metrics Server / Prometheus adapter is available.
  - Load test scripts and staging validation report.
- **Risks**
  - Thrashing from aggressive thresholds/cooldowns.
  - Scaling on wrong metric (CPU not correlated with latency).
- **Rollback**
  - Disable HPA (`kubectl delete hpa <api>` or set min=max fixed replicas).
  - Revert to static replica count in deployment.

---

### Phase 5 - Progressive Production Cutover (canary/weighted)

**Goal:** Move traffic gradually from VM to K8s.

- **Scope / assets**
  - Ingress/Gateway config for weighted routing (or external LB split).
  - Release playbook with traffic steps (example: 5% -> 25% -> 50% -> 100%).
  - Monitoring dashboards + alert rules per environment and per backend target.
- **Risks**
  - Latent production-only behavior differences.
  - Connection/timeouts mismatch across old/new paths.
- **Rollback**
  - Immediate traffic weight to 0% K8s / 100% VM.
  - Keep VM infra warm until burn-in window passes (e.g., 1-2 weeks).

---

### Phase 6 - Decommission VM and Harden Operations

**Goal:** Complete migration and reduce operational risk.

- **Scope / assets**
  - Remove VM deploy jobs/scripts from CI.
  - Update runbooks/on-call docs for K8s-only operations.
  - FinOps review for right-sizing requests/limits/HPA bounds.
  - Backup DR docs, incident playbooks, SLO alert tuning.
- **Risks**
  - Premature VM decommission before confidence window.
  - Cost spikes from conservative overprovisioning.
- **Rollback**
  - Time-boxed rollback option: keep VM image + infra IaC available for rapid restore.
  - If severe regression after decommission, redeploy VM from last golden artifact.

---

## Recommended File/Asset Checklist

- **Container**
  - `Dockerfile`, `.dockerignore`
- **Kubernetes**
  - `k8s/deployment.yaml`, `k8s/service.yaml`, `k8s/hpa.yaml`
  - `k8s/configmap.yaml`, secrets mechanism, `k8s/pdb.yaml`, optional `k8s/ingress.yaml`
- **CI/CD**
  - CI pipeline file, image scanning step, environment promotion logic
  - Helm chart or Kustomize overlays
- **Ops**
  - Dashboards, alerts, rollout/rollback runbook

---

## Exit Criteria Per Phase (quick gates)

- Phase 1: Image runs locally, health endpoints pass, no critical vuln findings.
- Phase 2: Stable K8s pods for 24h in non-prod, no crash loops.
- Phase 3: One-click deploy to staging with immutable tags.
- Phase 4: HPA scales up/down predictably under load test.
- Phase 5: Production SLOs hold through 100% K8s traffic.
- Phase 6: VM fully retired, K8s runbook validated in game day.

If you want, I can turn this into a concrete implementation template for your stack (Helm vs Kustomize, GitHub Actions vs GitLab CI) with starter `Dockerfile`, `deployment.yaml`, `hpa.yaml`, and CI pipeline skeleton.