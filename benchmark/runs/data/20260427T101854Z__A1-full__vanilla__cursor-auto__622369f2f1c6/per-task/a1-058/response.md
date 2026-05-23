## Doctor-Style Diagnosis Playbook

Use this exact order so you can isolate where “new code” stops flowing.

### 0) Non-Destructive Policy (explicit)
- Only run **read-only** commands first (`status`, `branch`, `log`, `remote`, CI/deploy inspect).
- Do **not** rewrite history (`reset --hard`, force-push, rebase -i) during diagnosis.
- Do **not** delete build artifacts/CDN globally without scoped confirmation.
- Any fix step that changes state should be minimal, reversible, and documented.

---

### 1) Current Branch Is Correct
**Check**
- `git status`
- `git branch --show-current`
- `git log --oneline -n 5`

**Pass criterion**
- Clean/expected working tree.
- You are on the branch that should power production (e.g. `main`).
- Latest local commit is the intended release commit.

**Failure modes**
- On wrong branch.
- Local branch has old commit.
- Uncommitted local edits masking what’s deployed.

**Recommended fix**
- Switch to intended branch.
- Commit/stash local work if needed.
- Pull/fetch and verify commit hash before redeploy.

---

### 2) Upstream Tracking and Remote Sync
**Check**
- `git remote -v`
- `git branch -vv`
- `git fetch --all --prune`
- `git rev-parse HEAD`
- `git rev-parse @{u}` (if upstream exists)

**Pass criterion**
- Branch tracks the correct remote branch (`origin/main`, etc.).
- `HEAD` equals upstream tip (or intentionally ahead with known commit).
- No mismatch between expected remote and actual remote URL.

**Failure modes**
- Tracking wrong upstream branch.
- Pulling from wrong remote.
- Local says up to date, but with the *wrong* upstream.

**Recommended fix**
- Set correct upstream: `git branch --set-upstream-to=origin/main main` (adjust names).
- Correct remote URL if wrong.
- Fetch and compare hashes again, then redeploy.

---

### 3) Deploy Target Ref (What Platform Actually Deploys)
**Check**
- In deploy platform: confirm environment (prod vs staging), project, and branch/ref setting.
- Verify deployed commit SHA from deployment logs/metadata.
- Confirm redeploy action is from latest commit, not “rebuild old deployment”.

**Pass criterion**
- Production target points to intended branch/tag.
- Latest successful deployment SHA == expected git SHA.
- No accidental staging/project mix-up.

**Failure modes**
- Platform deploys `master` while team updates `main`.
- Redeploy repeats old artifact from older commit.
- Deploying to staging URL but checking production URL (or vice versa).

**Recommended fix**
- Update deploy config branch/ref.
- Trigger new deployment from correct commit SHA.
- Validate correct URL/environment mapping.

---

### 4) Build Artifact Freshness
**Check**
- Build logs include current commit SHA/time.
- App exposes version marker (commit hash in footer, `/version`, build metadata).
- Ensure build cache isn’t pinning stale dependencies/output.

**Pass criterion**
- Built artifact contains current commit SHA.
- Build step actually reruns (or cache invalidates correctly).
- Runtime container/static bundle timestamp and hash are current.

**Failure modes**
- CI cache serving stale `.next`, `dist`, Docker layer, or static bundle.
- Build from old lockfile/context.
- Artifact registry points to old image tag (`latest` ambiguity).

**Recommended fix**
- Bust build cache once (scoped).
- Use immutable image tags (commit SHA), not only `latest`.
- Embed and verify release SHA in artifact/UI.

---

### 5) CDN / Edge / Browser Cache
**Check**
- Compare `curl -I` headers (`cache-control`, `etag`, `age`, CDN cache status).
- Hard refresh and test in private window.
- Request versioned asset URL directly (hashed filename).
- Purge specific paths if CDN in front.

**Pass criterion**
- HTML and critical assets reflect new version/hash.
- CDN age/status indicates fresh content after deploy/purge.
- Multiple regions/devices see updated version.

**Failure modes**
- CDN serves stale HTML.
- Service worker caches old shell/assets.
- Browser cache pinned due to cache headers.

**Recommended fix**
- Purge CDN for HTML entrypoints first.
- Use content-hashed assets + short HTML TTL.
- If PWA, bump service worker version and force clients to update safely.

---

## Quick Decision Tree
- `git pull` says up to date + deploy SHA old → **deploy target/ref problem**.
- Deploy SHA correct + site old → **artifact or cache problem**.
- Artifact has new SHA + one user sees old → **edge/browser/service worker cache**.

---

## Minimal Command Set (safe)
```bash
git status
git branch --show-current
git branch -vv
git remote -v
git fetch --all --prune
git rev-parse HEAD
git rev-parse @{u}
git log --oneline --decorate -n 10
```

If you want, I can convert this into a one-page runbook template your team can reuse during incident triage.