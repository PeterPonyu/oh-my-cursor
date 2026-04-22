---
name: local-plugin-check
description: Validate the repo-root Cursor plugin structure, then follow the local plugin verification walkthrough.
---

# Local Plugin Check

Use this skill when you want a quick, truthful verification pass for the
repo-root `oh-my-cursor` plugin.

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
- verify the shipped plugin rule and skill are visible

## Boundaries

- This skill validates the **checked-in plugin structure**.
- It does **not** by itself prove marketplace publication, hook manifests,
  custom-agent packaging, or repo-owned MCP defaults.
