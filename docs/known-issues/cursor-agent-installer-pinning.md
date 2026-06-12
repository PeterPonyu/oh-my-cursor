# Known Issue: cursor-agent installer pinning in CI

**Affected file:** `.github/workflows/node-ts-ci.yml` (headless e2e lane)  
**First noted:** commit `2c20a6c` (2026-06-09)  
**Status:** mitigated in CI — the headless lane downloads a fixed artifact and verifies SHA-256 before extraction.

---

## What the workflow does now

The headless e2e lane no longer executes the mutable installer script from
`https://cursor.com/install`. Instead, it downloads a versioned Linux x64
artifact directly from `downloads.cursor.com`, verifies the pinned SHA-256, and
then extracts it into the same `~/.local/share/cursor-agent/versions/<version>`
layout used by the official installer.

Current CI pin:

```yaml
CURSOR_AGENT_VERSION: "2026.06.12-01-15-52-7244546"
CURSOR_AGENT_SHA256: "453411639b4e49090eb2eec8032f5832b3f78a0486ba6e177bd8c0019c5e0c60"
```

This removes the live `curl | bash` execution path from CI and makes upgrades an
explicit workflow diff.

---

## Remaining supply-chain considerations

| Risk | Current control |
|---|---|
| Silent upstream upgrades | The workflow pins `CURSOR_AGENT_VERSION`; CI keeps using that artifact until the pin changes. |
| Artifact tampering or CDN drift | `sha256sum -c -` verifies the downloaded tarball before extraction. |
| Mutable installer script execution | CI does not execute `https://cursor.com/install`; it downloads the package artifact directly. |
| Intentional upgrades | Maintainers must update both the version and checksum in one PR, then rerun headless e2e. |

---

## How to update the pin

1. Inspect the official installer script and identify the new `downloads.cursor.com/lab/<version>/linux/x64/agent-cli-package.tar.gz` artifact.
2. Download the artifact locally and compute `sha256sum`.
3. Update `CURSOR_AGENT_VERSION` and `CURSOR_AGENT_SHA256` together in `.github/workflows/node-ts-ci.yml`.
4. Run the headless e2e lane or `npm run e2e:headless` in an environment where the pinned binary is on `PATH`.

Do not reintroduce `curl -fsSL https://cursor.com/install | bash` in CI; doing
so would restore mutable remote-code execution on every workflow run.
