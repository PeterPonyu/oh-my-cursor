I’ll run a structured doctor-style diagnosis now and report each check with clear pass criteria, status (`OK`/`WARN`/`CRITICAL`), and safe ranked fixes. I’ll start by loading the doctor workflow instructions, then execute the checks in order.I’ve loaded the doctor protocol and I’m now running the ordered environment checks (binary/PATH, versions, config, skills/plugins, hooks, and available validation scripts) so I can produce a structured health report.I’ve gathered most filesystem-level evidence; next I’m validating config/schema-related files directly and then I’ll finalize the diagnosis table with pass criteria and prioritized fixes.## Doctor Diagnosis Report (Structured)

### Summary
`ISSUES FOUND` — most likely root cause of intermittent `command not found` is a PATH initialization mismatch (tool binaries appear installed only under NVM-managed paths, not system-wide paths).

### Ordered Checks

| # | Check | Pass Criterion | Status | Evidence |
|---|---|---|---|---|
| 1 | Binary on PATH + which copy | CLI binary resolves consistently in all shell modes; single intended binary copy is used | **CRITICAL** | `codex`/`omx` binaries exist at `~/.nvm/versions/node/v24.12.0/bin/` (symlinked to npm globals), but no copies in `/usr/bin`, `/usr/local/bin`, or `~/.local/bin`. This commonly causes “works sometimes” when shell startup differs. |
| 2 | Version check | `tool --version` succeeds and reports expected versions | **WARN** | Direct `--version` execution wasn’t available in this environment; package metadata shows `@openai/codex` `0.124.0` and `oh-my-codex` `0.14.4` from installed `package.json` files. |
| 3 | Config dir presence + ownership | Config root exists, owned by current user, readable/writable | **OK** | `~/.codex` exists and is owned by `zeyufu:zeyufu` with writable permissions. |
| 4 | Config file schema match | Primary config files exist and are structurally valid for current install layout | **OK** | `~/.codex/config.toml` present with plugin + OMX MCP sections; `~/.codex/hooks.json` present with valid hook object structure; legacy `~/.codex/settings.json` absent (acceptable). |
| 5 | Plugin/skill registration | Enabled plugin entries align with cache; skills root exists and populated | **WARN** | Plugins enabled in `config.toml` and cached under `~/.codex/plugins/cache/openai-curated/*`; skills present in `~/.codex/skills`. But legacy-style native agent files exist in `~/.codex/agents`, which can create confusion in mixed setups. |
| 6 | Hook directory state | No stale legacy hook scripts; active hook path points to current runtime | **OK** | No `~/.codex/hooks/*.sh` legacy directory found; active hooks in `~/.codex/hooks.json` point to `codex-native-hook.js` under installed OMX package. |
| 7 | Validation script results (if any) | Installation-specific validator exists and runs clean | **WARN** | No dedicated install-health validator output captured from this environment. Found generic validation scripts under skill/plugin trees, but none authoritative for end-to-end install health. |

---

### Likely Cause of “Inconsistent Behavior”
- **Primary hypothesis (high confidence):** PATH differs across shell contexts (interactive vs non-interactive / login vs non-login), so `codex`/`omx` are only found when NVM initialization runs.
- **Secondary contributor:** mixed old/new orchestration surfaces (skills + native agents) may cause “config missing” style confusion depending on startup path and loaded surfaces.

---

### Recommended Fixes (ranked by safety)

1. **Safest: make binary path deterministic**
   - Ensure `~/.nvm/versions/node/v24.12.0/bin` is always on PATH (or ensure NVM init runs in every shell context used by the CLI).
   - Verify in each shell type (`bash -lc`, terminal tab, CI shell).

2. **Safest: keep config canonical**
   - Keep using `~/.codex/config.toml` + `~/.codex/hooks.json`.
   - Do not reintroduce legacy `settings.json` hooks.

3. **Low risk: reduce mixed-surface ambiguity**
   - Review `~/.codex/agents` contents; keep only intentional custom agents.
   - If these are legacy OMX artifacts and not needed, archive first, then remove.

4. **Medium risk: reinstall/refresh CLI globals**
   - Reinstall `@openai/codex` and `oh-my-codex` in the active Node/NVM context to refresh symlinks and entrypoints.

5. **Higher risk cleanup: remove stale/legacy trees**
   - Only after backup and confirmation: remove obsolete legacy paths if overlapping with active install.

---

### Confirm-First Rule (Destructive Actions)
Before any destructive action (delete/move under `~/.codex`, uninstall globals, wipe plugin caches, remove legacy dirs), follow this rule:

- **Always confirm first**, then
- **Create a backup/snapshot**, then
- **Apply one change at a time**, then
- **Re-test command resolution and config loading after each step**.

If you want, I can run a **non-destructive remediation pass** next (PATH hardening checks + startup-file audit + post-fix verification commands).