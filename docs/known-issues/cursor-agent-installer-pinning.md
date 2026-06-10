# Known Issue: cursor-agent installer not version-pinnable

**Affected file:** `.github/workflows/node-ts-ci.yml` (headless e2e lane)  
**First noted:** commit `2c20a6c` (2026-06-09)  
**Status:** open — no upstream arg-pin mechanism available yet

---

## What the workflow does today

The headless e2e lane installs `cursor-agent` via the official installer
script:

```bash
curl -fsSL https://cursor.com/install | bash
```

This always fetches and executes the *latest* version of the installer from
`cursor.com` at runtime.

---

## Supply-chain risk

| Risk | Detail |
|---|---|
| No version pin | Any new release of `cursor-agent` is silently picked up by every subsequent CI run. |
| Remote code execution | `curl … | bash` runs arbitrary code downloaded at job time from a third-party host. |
| No checksum verification | The installer is not pinned by hash, so a compromised CDN or MITM could deliver a different binary. |
| Reproducibility gap | Two runs minutes apart may install different versions, making failures hard to reproduce and bisect. |

The original commit (`2c20a6c`) acknowledged this in its message
("cursor-agent installer not arg-pinnable; pin tracked as a follow-up
issue") but no tracking issue was ever opened.

---

## Why it cannot be arg-pinned today

The `cursor.com/install` script does not expose a version selector argument
(e.g. `--version <tag>`) or a versioned URL scheme (`cursor.com/install/v1.2.3`).
Until the upstream installer supports it, the only version-pinning
options are vendor-side workarounds (see below).

---

## Candidate mitigations

### 1. Vendor a checksum assertion (short-term, low friction)

After installation, assert the installed binary hash matches a known-good
value:

```bash
EXPECTED_SHA256="<sha256-of-known-good-cursor-agent>"
ACTUAL_SHA256=$(sha256sum "$(command -v cursor-agent)" | awk '{print $1}')
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "cursor-agent checksum mismatch — refusing to proceed" >&2
  exit 1
fi
```

**Downside:** the expected hash must be updated manually whenever a new
version is intentionally adopted.

### 2. Version probe + assert after install (short-term, readable)

Query the installed binary for its self-reported version and assert it
matches the version the team last validated against:

```bash
EXPECTED_VERSION="0.x.y"
ACTUAL_VERSION=$(cursor-agent --version 2>/dev/null || echo "unknown")
if [ "$ACTUAL_VERSION" != "$EXPECTED_VERSION" ]; then
  echo "cursor-agent version mismatch: expected $EXPECTED_VERSION, got $ACTUAL_VERSION" >&2
  exit 1
fi
```

**Downside:** relies on `cursor-agent --version` being stable; fails open
if the binary has no version flag.

### 3. Cache the binary in the repo or a private artifact store (medium-term)

Commit or upload a known-good `cursor-agent` binary + hash, download it in
CI from the controlled store instead of hitting `cursor.com/install`.

**Downside:** binary checked into git is discouraged; artifact store adds
operational overhead.

### 4. Wait for upstream versioned installer URL (long-term)

Track the upstream Cursor release notes or installer repo for a versioned
install path (e.g. `cursor.com/install/v<version>`) and migrate to it once
available.

---

## Recommended next step

Open a tracking GitHub issue titled:
> "ci: pin cursor-agent installer to a specific version"

Reference this document and block it on upstream support for a versioned
installer URL. Until resolved, apply **mitigation 2** (version probe +
assert) as a minimum safety net so unexpected upgrades cause a visible CI
failure rather than a silent behaviour change.
