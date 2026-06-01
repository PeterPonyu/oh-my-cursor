# Local Plugin Verification

This document records the reproducible local-load path for the repo-root
`oh-my-cursor` plugin.

## Goal

Verify that the checked-in plugin surface can be loaded from Cursor's local
plugin directory without claiming more automation than the repo actually owns.

## Manual verification steps

1. Install the local plugin path with:

   ```bash
   node --experimental-strip-types scripts/install-local-plugin.ts
   # or build first, then install the bundled payload:
   node --experimental-strip-types scripts/build-dist.ts
   node --experimental-strip-types scripts/install-local-plugin.ts --root dist/oh-my-cursor --force
   ```

   The default command installs directly from the repository root. The build +
   install path uses the bundled runtime payload under `dist/oh-my-cursor`,
   which is the closer bundle-style validation path for a production-like local
   install.
   Both flows create a copied plugin tree by default at
   `~/.cursor/plugins/local/oh-my-cursor`.
   Use `--symlink` if you need a live repository symlink for development.
   Copy mode installs only the minimal runtime plugin payload (`.cursor-plugin/`,
   `rules/`, `skills/`, `hooks/hooks.json`, `hooks/`,
   `agents/`, `.cursor/state/`, plus top-level metadata files) and
   omits repository development/test surfaces such as `benchmark/`, `apps/`,
   `docs/`, and `scripts/`.
   When installing the default `oh-my-cursor` plugin, the helper also removes
   the old `oh-my-copilot-workspace` (legacy alias, retained for
   backward-compatible cleanup only) local alias from the same target root so
   Cursor's plugin list does not keep showing the stale workspace companion
   after a reload.
2. Confirm the plugin root contains:
   - `.cursor-plugin/plugin.json`
   - the shipped plugin rules
   - at least one shipped plugin skill
   - `hooks/hooks.json` and `hooks/`
   - `agents/`
   - `.cursor/state/`
3. Start Cursor, or run **Developer: Reload Window** if Cursor is already open.
4. Open the local plugin workspace and confirm the shipped plugin components are
   visible/active.
5. If validation notes or screenshots are collected, store them as proof
   artifacts rather than upgrading docs by memory alone.

## Development workflow

Choosing the right install mode depends on how you work:

### Symlink mode (recommended for active development)

```bash
node --experimental-strip-types scripts/install-local-plugin.ts --symlink
```

Symlink mode creates a link from `~/.cursor/plugins/local/oh-my-cursor` directly
to the repository root. Any changes you make in the repo are visible to Cursor
after a **Developer: Reload Window** — no re-install needed. This is the fastest
iteration path when you are actively editing rules, skills, hooks, or agents.

### Copy mode (default, recommended for testing stable builds)

```bash
node --experimental-strip-types scripts/install-local-plugin.ts              # first install
node --experimental-strip-types scripts/install-local-plugin.ts --force      # re-install after changes
```

Copy mode copies only the minimal runtime payload into the target directory.
It excludes development surfaces (`benchmark/`, `apps/`, `docs/`, `scripts/`,
`.git/`, `__pycache__/`) and produces a clean snapshot. Use this when you want
a stable, reproducible install that is isolated from ongoing repo edits.

### Watch mode (auto-reinstall on changes)

```bash
node --experimental-strip-types scripts/install-local-plugin.ts --watch
```

Watch mode performs an initial copy-mode install, then monitors the repo for
changes using `inotifywait` (Linux) or `fswatch` (macOS). On each change it
automatically re-copies the payload and prints:

```
Re-copied payload — reload Cursor to see changes
```

Press Ctrl+C to stop watching. Watch mode requires copy mode (it is incompatible
with `--symlink` since symlinks already reflect changes live).

### Status and uninstall

```bash
node --experimental-strip-types scripts/install-local-plugin.ts status       # show version, mode, staleness
node --experimental-strip-types scripts/install-local-plugin.ts version      # print installed manifest version only
node --experimental-strip-types scripts/install-local-plugin.ts --status     # same as status
node --experimental-strip-types scripts/install-local-plugin.ts --version    # same as version
node --experimental-strip-types scripts/install-local-plugin.ts --uninstall  # remove plugin and legacy aliases
```

`status`/`--status` reports the installed version, whether it is a symlink or
copy, the file count, and whether the installed version is stale relative to
the repo. `version`/`--version` prints only the installed plugin manifest
version from `.cursor-plugin/plugin.json`; `package.json` is private tooling
metadata and is not the installed OMCS release version.
`--uninstall` removes the plugin directory and any legacy `oh-my-copilot-workspace`
(legacy alias, retained for backward-compatible cleanup only) alias.

## Dev-Iteration Refresh Cycle

The following steps describe the full rebuild-and-reinstall cycle used to test
a clean, production-like plugin payload after making repo changes.

### Step 1 — Rebuild the dist payload

```bash
node --experimental-strip-types scripts/build-dist.ts
```

`build-dist.ts` validates the plugin structure (runs
`validate-plugin-structure.ts`), removes any stale `dist/` directory, and
copies only the minimal runtime payload to `dist/oh-my-cursor/`. Dev artifacts
(`__pycache__/`, `*.pyc`, `*.lock`) are stripped by the rsync filter list
before the copy completes.

### Step 2 — Reinstall from the dist payload

```bash
node --experimental-strip-types scripts/install-local-plugin.ts --root dist/oh-my-cursor --force
```

Installing from `dist/oh-my-cursor` (rather than the repo root) exercises the
same artifact path that a marketplace-packaged install would follow. The
`--force` flag replaces an existing install without prompting. The installer
removes legacy `oh-my-copilot-workspace` (legacy alias, retained for
backward-compatible cleanup only) aliases and any stale `mcp/` tree from a prior
`--with-mcp` install.

### Step 3 — Reload Cursor

Run **Developer: Reload Window** inside Cursor (or restart Cursor). The
installer does **not** trigger a Cursor reload automatically; the final reload
remains a manual product action. The plugin becomes active once Cursor picks
up the new files.

### Quick verification after reinstall

```bash
node --experimental-strip-types scripts/install-local-plugin.ts status
node --experimental-strip-types scripts/install-local-plugin.ts version
node --experimental-strip-types scripts/check-local-plugin-install.ts
```

`status` reports the installed version, install mode, file count, and whether
the payload is stale relative to the repo. `version` prints only the installed
manifest version for scripts and support/debug answers. `check-local-plugin-install.ts`
runs a CI-safe end-to-end check in temporary directories without touching the
live install.

### Live-iteration shortcut (symlink mode)

When making rapid edits to rules, skills, hooks, or agents, use symlink mode
instead of the full rebuild cycle:

```bash
node --experimental-strip-types scripts/install-local-plugin.ts --symlink
# edit files in the repo
# run Developer: Reload Window in Cursor to pick up changes
```

No reinstall is needed between edits; the symlink points directly at the repo
root. Switch back to the `dist`-based rebuild cycle when you want a clean
copy-mode snapshot for final validation.

### Watch mode (automatic re-copy)

```bash
node --experimental-strip-types scripts/install-local-plugin.ts --watch
```

Watch mode performs an initial copy-mode install, then monitors the repo for
file changes using `inotifywait` (Linux) or `fswatch` (macOS). On each detected
change it re-copies the payload and prints:

```
Re-copied payload — reload Cursor to see changes
```

Watch mode handles re-copying automatically, but Cursor still requires a manual
**Developer: Reload Window** to pick up each new payload. Press Ctrl+C to stop.
Watch mode is incompatible with `--symlink` (symlinks already reflect changes
live).

---

## Enhancement Policy

This section defines which changes require a full rebuild-and-reinstall versus
a lighter refresh, and documents the contamination prevention rule for copy-mode
installs.

### Change surface vs required refresh

| Change type | Symlink mode | Copy mode |
|---|---|---|
| Edit a rule, skill, or agent file | Cursor reload only | `--force` reinstall required |
| Edit a hook script | Cursor reload only | `--force` reinstall required |
| Add or remove a payload file | Cursor reload only | Rebuild (`build-dist.ts`) + `--force` reinstall |
| Bump plugin version in `plugin.json` | Cursor reload only | Rebuild + `--force` reinstall |
| Structural payload contract change | Cursor reload only | Rebuild + `--force` reinstall |
| Change a dev-only file (`docs/`, `scripts/`, `benchmark/`) | No action needed | No action needed (excluded from payload) |

In symlink mode every repo change is visible to Cursor after a
**Developer: Reload Window** — no reinstall is needed. In copy mode the
installed snapshot is frozen at install time and must be explicitly refreshed.

### `__pycache__` contamination prevention rule

**Always install copy-mode payloads from `dist/oh-my-cursor`** (built by
`build-dist.ts`), not directly from the repo root.

The build script strips `__pycache__/`, `*.pyc`, and `*.lock` files before
writing to `dist/`. The installer's rsync filter list repeats this exclusion,
but if Python has generated cache directories in the repo root between the last
build and the install step, a direct repo-root copy-mode install may carry
those artifacts into `~/.cursor/plugins/local/oh-my-cursor/`. Installing from
`dist/` avoids this because the build step already ran the exclusion at build
time.

After any copy-mode reinstall, confirm zero contamination with:

```bash
find ~/.cursor/plugins/local/oh-my-cursor -name "__pycache__" -o -name "*.pyc" | wc -l
# expected: 0
```

A non-zero count means the installed payload contains dev artifacts. Rebuild
with `build-dist.sh` and reinstall from `dist/oh-my-cursor` to recover.

---

## Verification boundaries

- The walkthrough itself is a **repo-owned** checked-in document.
- The install helper is a **repo-owned** checked-in script that only manages the
  local plugin path.
- The local install path under `~/.cursor/plugins/local` belongs to the **user
  environment**, not the repo.
- Reloading Cursor is a **manual product action**, not repo-owned automation.
- If a future automated smoke is added, it should strengthen wording only after
  the smoke is reproducible and checked in.

## What stays deferred

The local plugin walkthrough does **not** by itself prove or imply:

- default MCP configuration;
- custom mode provisioning; or
- marketplace publication.

## Suggested evidence to capture

When running the manual workflow, record at least:

- the absolute local plugin path used;
- whether `scripts/install-local-plugin.ts` used a copy or a symlink;
- whether Cursor required a full restart or only **Developer: Reload Window**;
- which plugin files were present; and
- any mismatch between the docs and the actual visible plugin surface.

## CI-safe companion check

If you only need to verify the helper behavior without touching the live Cursor
UI flow, run:

```bash
node --experimental-strip-types scripts/check-local-plugin-install.ts
```

That installs the plugin into bounded temporary directories in both symlink and
copy modes and verifies the resulting manifest/rule/skill payload.
