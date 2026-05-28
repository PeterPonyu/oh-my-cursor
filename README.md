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
node --experimental-strip-types scripts/install-local-plugin.ts

# Or with the opt-in MCP bridge for agent-callable state writes
node --experimental-strip-types scripts/install-local-plugin.ts --with-mcp

# Symlink mode for live development (changes visible after reload)
node --experimental-strip-types scripts/install-local-plugin.ts --symlink
```

After install, reload Cursor (**Developer: Reload Window**).

Verify the install with `node --experimental-strip-types scripts/check-local-plugin-install.ts`.

For a copy-pasteable workflow-state walkthrough, see [`docs/recipes/workflow-state-lifecycle.md`](./docs/recipes/workflow-state-lifecycle.md).

## What's included

| Component | Location | Purpose |
|-----------|----------|---------|
| **Hooks** (14 events) | `hooks/hooks.json` + `hooks/` | Every documented Cursor hook event is wired: `sessionStart`, `sessionEnd`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `subagentStart`, `subagentStop`, `beforeShellExecution`, `afterShellExecution`, `beforeReadFile`, `afterFileEdit`, `preCompact`, and `stop`. All scripts are stdlib-only, fail-open, and read-only against workflow-state |
| **Agents** (14 roles) | `agents/` | Full role registry — `orchestrator`, `architect`, `researcher`, `planner`, `implementer`, `qa-tester`, `verifier`, `critic`, `code-reviewer`, `debugger`, `tracer`, `security-reviewer`, `explore`, `test-engineer`. All checked-in agents use `model: auto` until benchmark evidence justifies pinning |
| **Skills** (20 skills) | `skills/` | Orchestration: `phase-controller`, `plan`, `iterate-loop`, `auto-execute`, `review`, `security-review`, `debug`, `trace`, `verify`, `deep-interview`, `doctor`, `local-plugin-check`, `mcp-setup`, `parallel-batch`, `team-controller`. Memory: `remember`, `notepad`, `wiki`, `decisions`, `rules-authoring` |
| **Rules** | `.cursor/rules/` + `rules/` | Cursor workspace guidance plus plugin boundary compatibility policy |
| **Memory templates** | `docs/templates/` | Notepad, project memory, wiki, and ADR templates shipped with the plugin |
| **Memory layer** | `docs/memory-layer.md` | Skill-owned notepad, project memory, decisions, and wiki (separate from workflow-state) |
| **State contract** | `.cursor/state/` + `src/oh_my_cursor/workflow_state/` | File-backed workflow-state contract, compatibility shims, and packaged API/CLI/lock implementation |
| **MCP bridge** (opt-in) | `mcp/cursor-state-bridge/` | Workflow-state writes plus optional memory tools via JSON-RPC |

## Docs

| Need | Read |
|------|------|
| Always-on policy | [`AGENTS.md`](./AGENTS.md) |
| Orchestration map | [`docs/orchestration.md`](./docs/orchestration.md) |
| Agent model policy | [`docs/agent-model-policy.md`](./docs/agent-model-policy.md) |
| Memory layer | [`docs/memory-layer.md`](./docs/memory-layer.md) |
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
