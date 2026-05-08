---
name: local-plugin-check
description: Validate the repo-root Cursor plugin structure, then follow the local plugin verification walkthrough.
---

# Local Plugin Check

> **Cursor host note.** This is a validation skill, not a fixer. It checks the repo-root plugin structure and follows the local plugin verification walkthrough. It does not modify Cursor's installation or the plugin payload.

## Governance

### Ownership Class
- **repo-owned**: YES — Checked in at `skills/local-plugin-check/SKILL.md` as a plugin structure validation skill.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: NO — Cursor does not document a plugin validation primitive; this is repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/local-plugin-check/SKILL.md`, `.cursor-plugin/plugin.json`, validators.
- **runtime-smoke**: YES — Runs `validate-plugin-structure.sh` and other validators; smoke test for plugin integrity.

### Claim Summary
This skill validates the repo-root Cursor plugin structure and follows the local plugin verification walkthrough. It proves the checked-in plugin artifact is intact and well-formed. No MCP or hooks required; this is a read-only validation workflow.

## MCP Integration Points

No direct MCP integration. This skill reads plugin artifacts and reports; no state updates.

## Hooks Dependencies

No hooks dependencies. This skill runs entirely within the Cursor chat.

## Orchestration Role

- **Lifecycle phase(s)**: intake
- **Invoked by**: User after cloning or editing plugin files
- **Invokes**: No other skills; runs validators
- **State contract**: No workflow-state updates; reports to chat
- **Failure handling**: Reports validator failures; does not auto-fix

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
