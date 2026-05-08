---
name: local-plugin-check
description: Validate the repo-root Cursor plugin structure, then follow the local plugin verification walkthrough.
---

# Local Plugin Check

Use this skill when you want a quick, truthful verification pass for the
repo-root `oh-my-cursor` plugin.

## Use when

- A new clone or branch needs to confirm the plugin payload is intact.
- After editing `.cursor-plugin/plugin.json`, hooks, agents, or rules.
- Before reporting "the local plugin works on my machine" to a teammate.
- As a smoke check after `./scripts/install-local-plugin.sh`.

## Skip when

- You only changed prose in `docs/` or `README.md`.
- The verification has already run on this commit (re-running is harmless
  but adds no signal).
- Cursor itself is not installed locally; this skill validates the
  checked-in artifact, not Cursor's runtime.

## What to run

1. Validate the checked-in plugin artifact:

```bash
./scripts/validate-plugin-structure.sh
```

2. Validate the broader repo contract:

```bash
./scripts/verify-backbone.sh
./scripts/validate-surface-visibility.sh
./scripts/validate-state-contract.sh
```

3. Follow the manual local-load walkthrough:

- read `docs/local-plugin-verification.md`
- load the repo from `~/.cursor/plugins/local/oh-my-cursor`
- reload Cursor
- verify the shipped plugin rules, skills, hooks, and agents are visible as
    applicable in the local Cursor environment

## Boundaries

- This skill validates the **checked-in plugin structure**.
- It does **not** by itself prove marketplace publication, custom modes,
  background-agent provisioning, or MCP defaults.
