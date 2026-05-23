I’ll draft a practical, phase-by-phase migration plan with concrete asset scope, key risks, and rollback actions for each phase. I’m quickly checking the planning skill guidance first so the output matches your expected format.## Phased Migration Plan: VM -> Kubernetes + HPA

### Assumptions
- API is stateless (no local session/file dependency).
- Current deployment is single VM behind a stable DNS/endpoint.
- You have (or will provision) a Kubernetes cluster and container registry.
- You can accept a short dual-run period (VM + K8s in parallel).

---

### Phase 0 — Baseline and Readiness Gate (No traffic change)

**Goal:** Make behavior measurable and reproducible before moving runtime.

**File/asset scope**
- `Dockerfile` (create/update for production build)
- `.dockerignore`
- `.env.example` and config docs
- `docs/runbook/migration.md` (or similar)
- Optional: health endpoint implementation (`/healthz`, `/readyz`) in API code
- CI scaffolding: `.github/workflows/ci.yml` (or your CI equivalent)

**Key steps**
- Define SLO baseline from VM: error rate, p95/p99 latency, CPU/memory usage.
- Ensure app exposes:
  - liveness signal (process alive),
  - readiness signal (dependencies reachable),
  - graceful shutdown on `SIGTERM`.
- Confirm no local filesystem/session coupling.
- Pin required runtime env vars and secrets contract.

**Risks**
- Hidden statefulness (tmp files, in-memory session assumptions).
- Missing graceful shutdown causes dropped in-flight requests.

**Rollback**
- No runtime change yet; rollback = revert code/config changes and keep VM path unchanged.

---

### Phase 1 — Containerize and Validate Locally

**Goal:** Build a production-grade image and prove parity outside VM.

**File/asset scope**
- `Dockerfile` (multi-stage, non-root user, minimal base image)
- `.dockerignore`
- `docker-compose.yml` (optional local integration validation)
- CI: build job in `.github/workflows/ci.yml`
- `Makefile` or scripts (`make docker-build`, `make docker-run`) optional

**Key steps**
- Build image with deterministic dependency install (`npm ci`).
- Run as non-root, expose correct port, set `NODE_ENV=production`.
- Add `HEALTHCHECK` (or rely on K8s probes later).
- Validate locally with representative env vars and smoke tests.
- Push image to registry from CI on main branch/tag.

**Risks**
- Native module/runtime mismatch in container.
- Image bloat -> slow pull/startup during scale events.

**Rollback**
- Do not cut traffic; if image is unstable, stop at this phase and keep VM deploy path.

---

### Phase 2 — Kubernetes Foundation (Single replica, no production traffic)

**Goal:** Deploy service in cluster safely and validate operational correctness.

**File/asset scope**
- `k8s/namespace.yaml`
- `k8s/deployment.yaml`
- `k8s/service.yaml`
- `k8s/configmap.yaml`
- `k8s/secret.yaml` (or ExternalSecret/SealedSecret manifest)
- `k8s/ingress.yaml` (or Gateway API)
- `k8s/pdb.yaml` (PodDisruptionBudget)
- `k8s/serviceaccount.yaml`, `k8s/rbac.yaml` (if needed)
- Optional overlays:
  - `k8s/overlays/staging/*`
  - `k8s/overlays/prod/*`
- CI/CD deploy job: `.github/workflows/deploy-k8s.yml`

**Key steps**
- Deploy with `replicas: 1` first.
- Set resource `requests/limits` (required before HPA).
- Add readiness/liveness probes mapped to app endpoints.
- Configure `terminationGracePeriodSeconds` and preStop behavior if needed.
- Validate:
  - pod starts/restarts cleanly,
  - probes pass,
  - logs/metrics visible,
  - service reachable in-cluster and externally (staging).

**Risks**
- Bad probes cause restart loops.
- Wrong requests/limits cause throttling or OOM kills.

**Rollback**
- `kubectl rollout undo deployment/<name>` for K8s regressions.
- Keep VM as primary; K8s remains dark or staging-only.

---

### Phase 3 — Add HPA and Autoscaling Safety Rails

**Goal:** Enable elastic scaling with predictable behavior.

**File/asset scope**
- `k8s/hpa.yaml` (autoscaling/v2)
- `k8s/deployment.yaml` updates for requests/limits and anti-affinity/topology spread
- Optional: `k8s/vpa.yaml` (if using VPA for recommendations only)
- Observability dashboards/alerts (repo-managed if applicable, e.g. `monitoring/*.yaml`)

**Key steps**
- Configure HPA target metrics:
  - CPU utilization target (e.g., 60–70%),
  - optional memory/custom metrics (RPS, queue depth).
- Set sane bounds: `minReplicas` and `maxReplicas`.
- Configure scale-up/down stabilization windows to prevent flapping.
- Run load tests to tune thresholds and startup times.

**Risks**
- Flapping from aggressive thresholds.
- Slow cold starts -> latency spikes before scale-up catches up.

**Rollback**
- Temporarily disable HPA by setting `minReplicas == maxReplicas` or removing HPA manifest.
- Scale Deployment manually to known-safe replica count.

---

### Phase 4 — Progressive Traffic Migration (Canary)

**Goal:** Shift production traffic gradually from VM to K8s.

**File/asset scope**
- Ingress/Gateway routing manifests (`k8s/ingress.yaml` or traffic-split CRDs)
- Optional progressive delivery config (Argo Rollouts/Flagger manifests)
- Runbook updates with rollout gates and abort criteria
- CI deploy pipeline gates/promotions

**Key steps**
- Start with tiny traffic slice to K8s (e.g., 5%).
- Observe key indicators for each step window:
  - 5xx rate,
  - p95/p99 latency,
  - saturation (CPU/memory),
  - pod restarts.
- Increase gradually (5% -> 25% -> 50% -> 100%).
- Keep VM hot as fallback until K8s is stable for agreed soak period.

**Risks**
- Sticky-session assumptions accidentally break.
- Differences in network timeouts / upstream keepalive behavior.

**Rollback**
- Immediate traffic shift back to VM (routing weight to 0% K8s).
- Keep K8s running for diagnosis; no need to destroy during incident.

---

### Phase 5 — Cutover Completion and VM Decommission

**Goal:** Finish migration and remove old single-VM dependency safely.

**File/asset scope**
- Infra-as-code for VM decommission (Terraform/Ansible if present)
- Finalized `k8s/*` production manifests
- CI cleanup: remove old VM deploy stages
- Ops docs/runbooks and on-call playbooks

**Key steps**
- Require stability window post-100% cutover (e.g., 7–14 days).
- Final cost/perf review, adjust HPA/resource settings.
- Decommission VM only after explicit sign-off.
- Archive legacy deployment docs/scripts.

**Risks**
- Decommissioning too early removes fallback.
- Cost regression from overprovisioned requests.

**Rollback**
- During soak period: re-enable VM path and route traffic back if required.
- After decommission: rollback becomes “rebuild from IaC”; keep this as last-resort DR only.

---

## CI/CD Migration Path (cross-phase checklist)

- **Build stage:** lint/test -> build container -> scan -> push image.
- **Deploy stage:** apply manifests to staging -> smoke tests -> promote to prod.
- **Policy gates:** block deploy if probes missing, requests/limits missing, or image scan criticals.
- **Release strategy:** immutable image tags (`sha`), environment overlays, and manual approval for production traffic shifts.

---

## Phase Exit Criteria (recommended)

- Phase 1 exit: container runs locally and in CI with passing smoke tests.
- Phase 2 exit: K8s staging stable, zero probe-related restart loops for 24h.
- Phase 3 exit: HPA responds correctly under load test; no sustained flapping.
- Phase 4 exit: 100% prod traffic on K8s with agreed SLOs for soak period.
- Phase 5 exit: VM decommissioned, runbooks updated, incident rollback play tested.

---

If you want, I can turn this into a concrete repo-ready scaffold next: exact `Dockerfile`, `k8s/` manifest set, and a GitHub Actions pipeline skeleton matching this phase plan.