# oh-my-cursor

A Cursor-native workflow backbone with an opt-in MCP server for
agent-callable workflow-state writes. Hooks read state, the bridge
writes it, and every claim is anchored to a checked-in artifact.

## Claim/proof discipline

Every surface in this repo carries an explicit ownership and proof
class:

- **repo-owned** — checked in here and locally validated.
- **host-product-only** — Cursor capabilities the product supports, but
  this repo does not provision as checked-in artifacts.
- **unsupported-or-out-of-scope** — surfaces this repo intentionally
  does not ship or claim.

Public wording stays inside the proof ceiling: **official-doc**,
**checked-in-artifact**, or **runtime-smoke**. Don't upgrade a class
without the matching artifact. Don't downgrade the wording for
deferred surfaces with vague "could be added later" language.

## Start here

| Need | Read |
| --- | --- |
| Always-on policy | [`AGENTS.md`](./AGENTS.md) |
| One-page orchestration map | [`docs/orchestration.md`](./docs/orchestration.md) |
| Workflow-state contract | [`docs/state-contract.md`](./docs/state-contract.md) |
| MCP bridge (opt-in writer) | [`docs/mcp-bridge.md`](./docs/mcp-bridge.md) |
| Acceptance-criteria index | [`docs/PRD.yaml`](./docs/PRD.yaml) |
| Change history | [`CHANGELOG.md`](./CHANGELOG.md) |

Older dev-process notes (refinement priorities, plugin-boundary
review, fallback policy) are checked in under
[`docs/archive/`](./docs/archive/) for reference; they are not part of
the live entry path.

## Ownership map

| Surface | Class | Strongest proof here |
| --- | --- | --- |
| Root `AGENTS.md` and `.cursor/rules/` | `repo-owned` | `checked-in-artifact` |
| Project hooks (`.cursor/hooks.json` + 14 stdlib-only scripts wiring 14 documented Cursor agent events) | `repo-owned` in trusted Cursor workspaces | `checked-in-artifact`; runtime behavior bounded by Cursor execution |
| Project agents under `.cursor/agents/*.md` | `repo-owned` | `checked-in-artifact` |
| Workflow-state contract under `.cursor/state/` (schema, example, library, lock primitive) | `repo-owned` | `checked-in-artifact` |
| Repo-root plugin manifest at `.cursor-plugin/plugin.json` and shipped rules/skills | `repo-owned` | `checked-in-artifact` |
| MCP server `mcp/cursor-state-bridge/` (six functional state-IO tools, opt-in install, stdio-only) | `repo-owned` (opt-in) | `checked-in-artifact`; `runtime-smoke` when `RUN_MCP_BRIDGE_SMOKE=1` |
| Local validators and benchmark artifacts under `scripts/` and `benchmark/` | `repo-owned` | `checked-in-artifact` |
| Cursor CLI consumption of repo guidance (rules, hooks, agents) | `host-product-only` | `official-doc` |
| Custom modes, background agents, MCP discovery flow | `host-product-only` | `official-doc` |
| Default `.cursor/mcp.json`, marketplace publication, repo-file custom-mode packaging | `unsupported-or-out-of-scope` | n/a (explicitly not shipped) |

## MCP bridge (opt-in)

The repo ships `mcp/cursor-state-bridge/` — a stdio JSON-RPC 2.0 MCP
server that owns agent-callable writes to
`.cursor/state/workflow-state.json`. Six tools mapped 1:1 to the
workflow-state schema (`state_read`, `state_init`, `state_set_phase`,
`state_record_failure`, `state_update_acceptance_criterion`,
`state_history_append`). No network listener; three jail roots;
`OH_MY_CURSOR_MCP_TOKEN` defense-in-depth auth (default OFF).

Default install excludes the bridge. Opt in:

```bash
./scripts/install-local-plugin.sh --with-mcp
cp .cursor/mcp.example.json .cursor/mcp.json   # edit ${workspaceFolder} placeholders
# reload Cursor; cursor-state-bridge appears in the MCP servers panel
```

See [`docs/mcp-bridge.md`](./docs/mcp-bridge.md),
[`docs/mcp-tool-surface.md`](./docs/mcp-tool-surface.md), and
[`docs/mcp-auth.md`](./docs/mcp-auth.md). The full multi-phase plan
that produced this bridge is archived under
[`docs/plans/mcp-state-bridge-2026-05/`](./docs/plans/mcp-state-bridge-2026-05/).

## Local plugin loading

```bash
./scripts/install-local-plugin.sh           # default minimal payload
./scripts/install-local-plugin.sh --with-mcp # include the MCP bridge
# restart Cursor or run Developer: Reload Window
```

The script copies the minimal runtime payload to
`~/.cursor/plugins/local/oh-my-cursor`. Reload Cursor, then verify
the shipped components are visible. Non-UI verification:
[`scripts/check-local-plugin-install.sh`](./scripts/check-local-plugin-install.sh)
(supports `--with-mcp`). Manual checklist:
[`docs/local-plugin-verification.md`](./docs/local-plugin-verification.md).

## Verification

Always-required checks (run from the repository root):

```bash
python3 scripts/validate-public-language.py
python3 scripts/validate-cursor-workflow-artifacts.py
./scripts/smoke-cursor-workflow-artifacts.sh
./scripts/verify-backbone.sh
```

Optional environment-gated runtime checks (require login + model
availability):

```bash
RUN_CURSOR_AGENT_SMOKE=1 ./scripts/smoke-cursor-agent.sh --run-agent-prompt
RUN_MCP_BRIDGE_SMOKE=1 ./scripts/smoke-mcp-cursor-state-bridge.sh \
  --full --jail-escape --from-example --auth
```

Backbone benchmark (refreshes
`benchmark/results/current-{baseline,enhanced}/`):

```bash
./benchmark/quick_test.sh --variant baseline
RUN_CURSOR_AGENT_SMOKE=1 ./benchmark/quick_test.sh --variant enhanced --run-agent-smoke
```
