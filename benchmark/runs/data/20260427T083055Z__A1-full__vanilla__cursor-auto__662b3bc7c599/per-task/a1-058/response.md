## Doctor Runbook: “`git pull` says up to date, site still old”

Use this in order. Stop when one check fails, apply its fix, then redeploy once.

### Non-Destructive Policy (explicit)
- Never run destructive git commands by default (`reset --hard`, force-push, rebase rewrite on shared branch).
- Never delete build/cache artifacts globally unless scoped and reversible.
- Prefer read-only verification first; then minimal corrective action.
- Record current state before changing anything (`git status`, `git branch -vv`, commit SHA).
- If a force action is truly needed, require explicit approval and backup branch/tag first.

---

### 1) Confirm local branch and HEAD
**Check**
- `git status`
- `git branch --show-current`
- `git rev-parse --short HEAD`

**Pass criterion**
- Working tree is clean (or known intentional changes).
- You are on the branch expected for deployment (e.g. `main`/`production`).
- HEAD SHA matches what you think you deployed.

**Failure mode**
- On wrong branch, detached HEAD, or uncommitted local edits masking state.

**Recommended fix**
- Switch to correct branch: `git checkout <deploy-branch>`
- Stash/commit local edits if needed.
- Redeploy from the verified branch SHA.

---

### 2) Verify upstream tracking and remote parity
**Check**
- `git remote -v`
- `git fetch --all --prune`
- `git branch -vv`
- `git log --oneline --decorate -n 5`
- Compare local vs remote SHA: `git rev-parse HEAD` and `git rev-parse @{u}`

**Pass criterion**
- Current branch tracks intended upstream (e.g. `origin/main`).
- Local HEAD equals upstream HEAD (or intentionally ahead with commit(s) deployed).

**Failure mode**
- Tracking wrong remote/branch, stale fetch, or deployment source not actually updated.

**Recommended fix**
- Set correct upstream: `git branch --set-upstream-to=origin/<branch> <branch>`
- Pull/fetch from correct remote.
- If deploy should use a different branch/tag, update deploy config (don’t “just pull” blindly).

---

### 3) Confirm deploy target ref (what platform actually deploys)
**Check**
- Inspect deployment config (examples): branch, tag, commit pin, Docker image tag.
- Verify latest deployment record references expected commit SHA.

**Pass criterion**
- Deploy target ref equals the intended commit SHA/branch head.
- No pin to old tag/image (e.g. `latest` drift or fixed old digest).

**Failure mode**
- Redeploy action reused an older successful artifact or old commit.
- Platform configured to deploy different branch/environment.

**Recommended fix**
- Point deploy target to correct branch/commit.
- Trigger a deploy with explicit commit SHA (immutable ref).
- For containers: use unique image tags (commit SHA), not mutable `latest` only.

---

### 4) Validate build artifact freshness
**Check**
- In CI/deploy logs, confirm build step ran for current commit SHA.
- Verify artifact metadata/version file includes current SHA/build time.
- Ensure cache key changes with source lockfiles/config when needed.

**Pass criterion**
- Artifact was freshly built from expected commit.
- Artifact content/version matches current SHA.

**Failure mode**
- Build cache served stale output, skipped build, or artifact promotion from old run.

**Recommended fix**
- Rebuild with cache-bust for this run only (safe, scoped).
- Include commit SHA in output (`VERSION`, env var, footer) to prove freshness.
- Tighten cache keys to include relevant files (lockfile, build config, source hash).

---

### 5) Check runtime environment/source mismatch
**Check**
- Confirm the environment redeployed (prod vs staging).
- Verify service points to intended backend/database/env vars.
- Hit deployed host directly if possible (origin URL) to bypass edge layers.

**Pass criterion**
- You are viewing the right environment and instance.
- Runtime config aligns with expected release.

**Failure mode**
- Redeployed staging, viewed production (or vice versa); wrong host/domain.

**Recommended fix**
- Redeploy correct environment.
- Correct DNS/host routing and environment variable mapping.

---

### 6) CDN / edge / browser cache validation
**Check**
- Request with cache bypass headers or query param versioning.
- Compare response headers: `cache-control`, `etag`, `age`, CDN cache status.
- Hard reload or test via curl/private window.

**Pass criterion**
- Fresh content served from origin/edge for current asset versions.
- Static assets are content-hashed and HTML invalidates promptly.

**Failure mode**
- CDN/browser serving stale HTML/assets despite successful deploy.

**Recommended fix**
- Purge CDN for changed paths (prefer scoped purge).
- Ensure hashed asset filenames and short/no-cache for HTML entrypoint.
- Add versioned cache-busting for critical assets.

---

## Quick Triage Matrix (symptom → likely cause)
- **`git pull` up to date, deploy log shows old SHA** → wrong deploy target ref.
- **Deploy log shows new SHA, site old** → stale build artifact or CDN cache.
- **Only some users see old site** → edge/browser cache propagation.
- **API new but UI old (or inverse)** → partial deploy between services/envs.

---

## Minimal Safe Command Set (read-first)
```bash
git status
git branch --show-current
git fetch --all --prune
git branch -vv
git rev-parse --short HEAD
git rev-parse --short @{u}
```

If you want, I can turn this into a copy-paste “incident checklist” template your team can run during deploy issues.