# MCP bridge — `cursor-state-bridge`

`cursor-state-bridge` is the repo-owned MCP server that handles writes to
the workflow-state document at `.cursor/state/workflow-state.json`. It
speaks JSON-RPC 2.0 over stdio, exposes six tools mapped 1:1 to the
workflow-state schema, and runs without any network listener.

The package source lives at
[`mcp/cursor-state-bridge/`](../mcp/cursor-state-bridge/README.md). Read
that README for the full tool surface, jail roots, environment variables,
and trace rotation policy.

## Why a bridge

Hooks under `.cursor/hooks/` already read workflow-state. The bridge gives
agents a structured, schema-faithful way to **write** that state without
shelling out to the writer CLI. The CLI surface at
`.cursor/state/workflow-state.py` stays in place as a thin shim over a
shared library API (the Phase 2 refactor) so both writers go through one
implementation and one file lock.

## Boundary discipline

The bridge is shipped under the repo's claim/proof discipline:

- `repo-owned` — checked-in source under `mcp/cursor-state-bridge/`.
- `checked-in-artifact` — the structure validator
  ([`scripts/validate-mcp-server-structure.py`](../scripts/validate-mcp-server-structure.py))
  proves the package is present and well-formed; the smoke harness
  ([`scripts/smoke-mcp-cursor-state-bridge.sh`](../scripts/smoke-mcp-cursor-state-bridge.sh))
  proves the runtime contract end-to-end when `RUN_MCP_BRIDGE_SMOKE=1` is set.
- `runtime-smoke` — env-gated; the default install does not invoke the
  bridge, and the smoke is a fast no-op when the env gate is unset.

The default plugin install excludes `mcp/`. Users opt in with
`./scripts/install-local-plugin.sh --with-mcp`. The user-environment
config file `.cursor/mcp.json` stays gitignored; the repo only ships the
template at `.cursor/mcp.example.json`.

## Documents

- [Tool surface table](./mcp-tool-surface.md) — six tools with PR1 status
  and Phase 2/3 promotion path.
- [State contract](./state-contract.md) — workflow-state ownership and the
  bridge's role as the agent-callable writer.
- [Consensus plan](./plans/mcp-state-bridge-2026-05/consensus-plan.md) and
  [open questions](./plans/mcp-state-bridge-2026-05/open-questions.md) —
  the deliberate-mode ralplan that scoped this work into six phases, plus
  the team-plan and team-verify handoffs under
  [`plans/mcp-state-bridge-2026-05/handoffs/`](./plans/mcp-state-bridge-2026-05/handoffs/).

## Quick start

```bash
# install opt-in
./scripts/install-local-plugin.sh --with-mcp

# template-to-config (one time)
cp .cursor/mcp.example.json .cursor/mcp.json   # edit placeholders if needed

# verify
python3 scripts/validate-mcp-server-structure.py
RUN_MCP_BRIDGE_SMOKE=1 ./scripts/smoke-mcp-cursor-state-bridge.sh --full --jail-escape --from-example
```

Reload Cursor; `cursor-state-bridge` appears in the MCP servers panel.

## What this bridge is not

- It is not a network server. It does not bind any TCP/UDP socket.
- It is not a knowledge base. It does not host notepad, wiki, or
  project-memory tools.
- It is not a code-execution surface. It does not expose ast-grep, LSP, or
  REPL tools.
- It is not the only writer. The Phase 2 refactor gives the existing
  `.cursor/state/workflow-state.py` CLI shim the same library and the same
  file lock, so a developer running the CLI directly does not race against
  the bridge.
