## Git Pull “Up To Date” but Site Is Old: Doctor Checklist

Use this in order. Stop when one check fails, apply the fix, then redeploy once.

### 0) Safety Policy (Non-Destructive)
- Do **not** use `git reset --hard`, `git clean -fd`, force-push, or history rewrites during diagnosis.
- Do **not** delete production resources or invalidate all caches globally unless scoped and approved.
- Prefer read-only checks first, then minimal reversible fixes.
- Create a backup branch before any risky correction:
  - `git branch backup/diag-$(date +%Y%m%d-%H%M%S)`

---

### 1) Verify Current Branch Is the Intended One
**Check**
- `git branch --show-current`
- `git status -sb`

**Pass criterion**
- You are on the expected deploy branch (e.g. `main`/`production`) and working tree is clean or intentionally staged.

**Failure modes**
- On wrong branch (e.g. `feature/*`).
- Local uncommitted changes masking expected state.

**Recommended fix**
- Switch to correct branch: `git switch <deploy-branch>`
- Commit/stash local changes if needed (non-destructive): `git stash push -u -m "pre-deploy-diagnosis"`.

---

### 2) Verify Upstream Tracking and Commit Sync
**Check**
- `git remote -v`
- `git branch -vv`
- `git fetch --all --prune`
- `git rev-parse HEAD`
- `git rev-parse @{u}`
- `git log --oneline --decorate -n 5`

**Pass criterion**
- Local `HEAD` equals upstream tracked ref (`@{u}`), and remote is the expected repo.

**Failure modes**
- Branch tracks wrong remote/branch.
- `HEAD` behind remote but stale fetch previously made pull look no-op.
- Pulling from fork/origin while deploy uses upstream.

**Recommended fix**
- Set correct upstream:
  - `git branch --set-upstream-to=origin/<deploy-branch> <deploy-branch>`
- If behind: `git pull --ff-only`
- If wrong remote: correct remote URL with `git remote set-url origin <correct-url>`.

---

### 3) Confirm Deploy Target Ref/Source in Hosting Platform
**Check**
- In hosting config (Vercel/Netlify/GitHub Actions/Render/etc.), verify:
  - Repo + branch selected for production
  - Auto-deploy source (push vs manual)
  - Commit SHA of latest deployment

**Pass criterion**
- Deployment points to the exact repo + branch + commit you just validated.

**Failure modes**
- Deploy target still bound to old branch.
- Monorepo app points to wrong subdirectory/project.
- Manual redeploy reruns old commit/artifact.

**Recommended fix**
- Change production branch/ref to correct one.
- Trigger deploy from specific commit SHA (not “rebuild previous”).
- Fix project root/app path in deploy settings.

---

### 4) Check Build Artifact Freshness
**Check**
- Compare deployed build metadata (commit SHA/build time) to `git rev-parse HEAD`.
- Confirm build logs include latest changed files.
- If app embeds version, verify rendered version marker.

**Pass criterion**
- Build artifact references current commit SHA and current timestamped build.

**Failure modes**
- Build cache reused old layers/artifacts.
- CI pipeline built from stale workspace.
- Wrong build context (e.g., wrong folder).

**Recommended fix**
- Redeploy with cache bypass (“clear/build without cache”).
- Ensure CI does fresh checkout (`fetch-depth: 0` optional, but fresh commit required).
- Fix build context/path; add visible version stamp (commit SHA) in output for future verification.

---

### 5) Validate Runtime Serving the New Artifact
**Check**
- Hit origin directly (if possible) bypassing CDN.
- Inspect response headers/content for version/SHA.
- Confirm no blue/green slot still routing old release.

**Pass criterion**
- Origin/runtime serves new commit artifact consistently.

**Failure modes**
- Old container/function still active.
- Traffic router pinned to prior release.
- Partial rollout left old instances.

**Recommended fix**
- Complete rollout/swap to new release.
- Restart only affected service instances (minimal scope).
- Verify health checks and routing weights.

---

### 6) CDN/Edge Cache Verification
**Check**
- Request with cache-bypass headers or query bust (for diagnosis only).
- Inspect `Age`, `X-Cache`, `CF-Cache-Status` (or provider equivalent).
- Validate hashed asset filenames changed between builds.

**Pass criterion**
- CDN either serves fresh files or revalidates to new origin content.

**Failure modes**
- HTML cached too long.
- CDN caching non-hashed assets aggressively.
- Service worker serving stale shell/assets.

**Recommended fix**
- Purge scoped paths (HTML entry points first, not full-zone unless necessary).
- Set cache policy:
  - HTML: `no-cache, must-revalidate`
  - Fingerprinted assets: long TTL + immutable
- Bump service worker version and force clients to update.

---

## Quick Triage Order (Fastest Signal)
1. `git branch --show-current` + `git branch -vv`
2. Hosting dashboard: deployed commit SHA
3. Build logs: commit SHA and changed file presence
4. Origin vs CDN response diff
5. Scoped CDN purge + redeploy without build cache

---

## Most Common Root Causes
- Correct local repo, wrong deploy branch in platform config.
- Redeploying previous successful build, not latest commit.
- CDN/service-worker cache masking successful deploy.
- Monorepo path mismatch causing unchanged app artifact.

If you want, I can turn this into a copy-paste runbook template with placeholders for your exact platform (Vercel/Netlify/GitHub Actions/Cloudflare, etc.).