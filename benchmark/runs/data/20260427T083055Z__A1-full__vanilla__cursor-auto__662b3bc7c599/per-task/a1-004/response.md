I’ll draft a concrete, phased migration plan with explicit scope, risks, and rollback playbooks per phase. I’m quickly checking the planning skill guidance first so the structure is maximally actionable.## Phased Migration Plan: VM -> Kubernetes + HPA

### Assumptions
- Service is stateless Node.js API (no local disk/session dependency).
- Current production runs on a single VM behind some ingress/LB.
- Container registry and Kubernetes cluster are available (or can be provisioned in parallel).
- Goal is zero/low-downtime migration with controlled rollout.

---

### Phase 0 - Baseline and Readiness (no traffic change)

- **Objective**: Make behavior measurable before migration.
- **File/Asset scope**:
  - App config: `.env.example`, config loader (`src/config/*`).
  - Health endpoints: `src/routes/health*` or equivalent.
  - Runbook/docs: `docs/ops/migration.md`.
- **Work**:
  - Add/verify `GET /healthz` (liveness) and `GET /readyz` (readiness dependency checks).
  - Externalize all config via env vars (no VM-only paths).
  - Capture baseline SLOs: p95 latency, error rate, RPS, CPU/memory on VM.
- **Risks**:
  - Hidden statefulness (temp files, in-memory sessions, sticky assumptions).
  - Missing readiness semantics causing bad pod routing later.
- **Rollback**:
  - No runtime cutover yet; rollback is reverting non-breaking app changes and keeping VM as-is.

---

### Phase 1 - Containerization

- **Objective**: Produce deterministic container artifact.
- **File/Asset scope**:
  - `Dockerfile` (multi-stage build).
  - `.dockerignore`.
  - Optional local dev: `docker-compose.yml`.
- **Work**:
  - Create production-grade `Dockerfile`:
    - Build stage (`npm ci`, build step).
    - Runtime stage (minimal base image, non-root user, only runtime deps).
    - Expose API port and startup command.
  - Add `.dockerignore` to reduce context and prevent secret leakage.
  - Validate startup, health endpoints, and graceful shutdown (`SIGTERM`) in container.
- **Risks**:
  - Image bloat / slow cold start.
  - Native dependency mismatch between VM and container OS.
- **Rollback**:
  - Keep VM deployment untouched.
  - If image fails, revert `Dockerfile` changes and keep shipping VM artifact.

---

### Phase 2 - Kubernetes Manifests (single replica, no production traffic)

- **Objective**: Run app in cluster safely before scale features.
- **File/Asset scope** (recommend `k8s/` directory):
  - `k8s/namespace.yaml`
  - `k8s/deployment.yaml`
  - `k8s/service.yaml`
  - `k8s/configmap.yaml`
  - `k8s/secret.yaml` (or ExternalSecret reference)
  - `k8s/ingress.yaml` (optional at this phase)
  - `k8s/pdb.yaml` (PodDisruptionBudget)
- **Work**:
  - Deployment with:
    - `replicas: 1`
    - `resources.requests/limits`
    - `readinessProbe` -> `/readyz`, `livenessProbe` -> `/healthz`
    - `terminationGracePeriodSeconds` + preStop/graceful shutdown alignment
  - ClusterIP Service exposure.
  - Config/secret wiring from env vars.
  - Smoke test from inside cluster.
- **Risks**:
  - Probe misconfiguration causing restart loops.
  - Incorrect resource sizing causing throttling/OOM.
- **Rollback**:
  - Delete or scale down K8s deployment; VM remains source of truth.
  - Revert manifest commits independently from app code if needed.

---

### Phase 3 - CI/CD for Container + Manifests

- **Objective**: Make builds and deployments repeatable.
- **File/Asset scope**:
  - CI pipeline config: `.github/workflows/deploy.yml` or `gitlab-ci.yml` / `Jenkinsfile`.
  - Manifest templating if used: `helm/` or `kustomize/`.
- **Work**:
  - CI steps:
    1. Unit/integration tests
    2. Build image
    3. Scan image (SCA/CVE)
    4. Push to registry
    5. Deploy to non-prod namespace
    6. Run smoke tests
  - CD gates: manual approval for prod.
  - Use immutable image tags (commit SHA), no `latest`.
- **Risks**:
  - Pipeline drift between environments.
  - Secrets handling mistakes in CI.
- **Rollback**:
  - Re-deploy prior known-good image tag via pipeline.
  - Keep previous manifests versioned and re-apply previous revision.

---

### Phase 4 - Introduce HPA in Staging

- **Objective**: Validate autoscaling behavior before prod.
- **File/Asset scope**:
  - `k8s/hpa.yaml`
  - Possibly `k8s/metrics-server` dependency docs (cluster-level).
- **Work**:
  - Add HPA (start CPU-based; optionally memory/custom metrics later):
    - `minReplicas: 2`, `maxReplicas: N`
    - target CPU utilization (e.g., 60-70%).
  - Load-test staging and verify:
    - scale-up latency,
    - scale-down stabilization,
    - no readiness flapping.
  - Tune `requests` first (HPA depends on them).
- **Risks**:
  - Thrashing from poor HPA thresholds/cooldowns.
  - Underprovisioned nodes blocking scale-up.
- **Rollback**:
  - Disable HPA (`kubectl delete hpa` or set fixed replicas).
  - Revert to fixed replica deployment in staging/prod.

---

### Phase 5 - Production Canary (small % traffic to Kubernetes)

- **Objective**: Shift real traffic gradually.
- **File/Asset scope**:
  - Ingress/service mesh routing config (`k8s/ingress.yaml` or mesh VirtualService).
  - Observability dashboards/alerts (`monitoring/*` if codified).
- **Work**:
  - Route 5% -> 25% -> 50% traffic to K8s over controlled windows.
  - Track SLO deltas against VM baseline:
    - error rate, p95/p99 latency, saturation, restart rate.
  - Freeze non-essential changes during cutover window.
- **Risks**:
  - Real traffic shape differs from staging tests.
  - Partial rollout can mask session/auth assumptions.
- **Rollback**:
  - Immediate traffic shift back to VM (set K8s weight to 0%).
  - Keep K8s running for debugging, but out of path.

---

### Phase 6 - Full Cutover + VM Decommission

- **Objective**: Kubernetes becomes primary runtime with HPA.
- **File/Asset scope**:
  - Finalized production manifests and runbooks.
  - Infra-as-code updates removing VM resources (Terraform/Ansible/etc).
- **Work**:
  - Move to 100% K8s traffic.
  - Observe for a defined soak period (e.g., 7-14 days).
  - Decommission VM only after soak + rollback window expires.
- **Risks**:
  - Premature VM teardown removes safety net.
  - Cost surprises from over-scaling.
- **Rollback**:
  - During soak: re-route traffic to VM if severe regression.
  - After VM decommission: rollback to prior K8s image/manifests; maintain backup restore plan (not VM).

---

## Cross-Phase Risk Register (Top items)

- **State leakage**: hidden local file/session/cache dependence -> enforce external state stores, stateless auth tokens.
- **Readiness/termination mismatch**: dropped requests during rollout -> strict probe + graceful shutdown tests.
- **HPA mis-tuning**: oscillation or slow scale-up -> tune requests/limits + stabilization windows.
- **Observability gaps**: hard rollback decisions -> require dashboards/alerts before canary.
- **Secret/config drift**: env mismatch between VM and K8s -> single config contract and parity checklist.

---

## Minimal Asset Checklist

- `Dockerfile`, `.dockerignore`
- `k8s/deployment.yaml`, `k8s/service.yaml`, `k8s/configmap.yaml`, `k8s/secret.yaml`, `k8s/hpa.yaml`, `k8s/ingress.yaml`, `k8s/pdb.yaml`
- CI pipeline file (`.github/workflows/*` or equivalent)
- `docs/ops/migration.md` runbook with rollback commands and owners

---

## Exit Criteria (per phase gate)

- **Container gate**: image builds reproducibly, health checks pass, graceful shutdown verified.
- **K8s gate**: pod stable >24h in non-prod, no probe loops, resource headroom confirmed.
- **HPA gate**: load test proves stable autoscaling and acceptable latency under scale events.
- **Canary gate**: no significant SLO regression at each traffic increment.
- **Cutover gate**: 100% traffic stable through soak period; rollback runbook remains tested.

If you want, I can turn this into a concrete repo-ready template (sample `Dockerfile`, `k8s/*.yaml`, and a GitHub Actions pipeline) as Phase 1-3 starter assets.