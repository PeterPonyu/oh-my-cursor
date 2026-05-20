# oh-my-cursor

<div align="center">
  <img src="./assets/oh-my-cursor-character.jpg" alt="oh-my-cursor character" width="600" />
</div>

A Cursor-native workflow backbone that ships rules, skills, agents, and
hooks to Cursor workspaces. The plugin orchestrates a documented
lifecycle — intake, research, plan, execute, verify, review — and keeps
every claim anchored to a checked-in artifact.

## Quick start

Type `@phase-controller` in the Cursor composer to start or resume an
oh-my-cursor workflow.

### Installation

The plugin is rooted at `.cursor-plugin/plugin.json` and installs to
`~/.cursor/plugins/local/oh-my-cursor/`.

```bash
# Install from the repo root (copy mode — minimal runtime payload)
./scripts/install-local-plugin.sh

# Or with the opt-in MCP bridge for agent-callable state writes
./scripts/install-local-plugin.sh --with-mcp

# Symlink mode for live development (changes visible after reload)
./scripts/install-local-plugin.sh --symlink
```

After install, reload Cursor (**Developer: Reload Window**).

Verify the install with `scripts/check-local-plugin-install.sh`.

## What's included

| Component | Location | Purpose |
|-----------|----------|---------|
| **Hooks** (14 events) | `hooks/hooks.json` + `hooks/` | Lifecycle automation: session bootstrap, tool guard, state watcher, stop gate, and more |
| **Agents** (12 roles) | `agents/` | Orchestrator, researcher, planner, implementer, verifier, debugger, tracer, and more — dispatched as Cursor sub-agents |
| **Skills** (14 skills) | `skills/` | Phase controller (entry), plan, iterate-loop, review, debug, trace, parallel-batch, auto-execute, security-review, doctor, mcp-setup, verify, and more |
| **Rules** | `rules/` | Plugin boundary policy |
| **State contract** | `.cursor/state/` | File-backed workflow state with JSON schema, library, and lock primitive |
| **MCP bridge** (opt-in) | `mcp/cursor-state-bridge/` | Agent-callable workflow-state writes via JSON-RPC |

## Docs

| Need | Read |
|------|------|
| Always-on policy | [`AGENTS.md`](./AGENTS.md) |
| Orchestration map | [`docs/orchestration.md`](./docs/orchestration.md) |
| Agent model policy | [`docs/agent-model-policy.md`](./docs/agent-model-policy.md) |
| State contract | [`docs/state-contract.md`](./docs/state-contract.md) |
| MCP bridge | [`docs/mcp-bridge.md`](./docs/mcp-bridge.md) |
| External runtime bridge | [`docs/external-runtime-bridge.md`](./docs/external-runtime-bridge.md) |
| External runtime compatibility | [`docs/external-runtime-compatibility.md`](./docs/external-runtime-compatibility.md) |
| Acceptance criteria | [`docs/PRD.yaml`](./docs/PRD.yaml) |
| Change history | [`CHANGELOG.md`](./CHANGELOG.md) |
| Confirmed surfaces | [`docs/confirmed-surfaces.md`](./docs/confirmed-surfaces.md) |
| Official references | [`docs/references.md`](./docs/references.md) |

Older dev notes (refinement priorities, plugin-boundary review, fallback
policy) live in [`docs/archive/`](./docs/archive/).

## Governance

Every surface in this repo carries an explicit ownership and proof class.
See [`docs/confirmed-surfaces.md`](./docs/confirmed-surfaces.md) for the
current map. The short version:

- **repo-owned** — checked in here and locally validated
- **host-product-only** — Cursor capabilities the product supports, not
  provisioned by this repo
- **unsupported-or-out-of-scope** — intentionally not shipped or claimed

## License

MIT — see [`LICENSE`](./LICENSE).
