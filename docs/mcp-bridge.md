# MCP bridge — `cursor-state-bridge`

`cursor-state-bridge` is the repo-owned MCP server that handles writes to
the workflow-state document at `.cursor/state/workflow-state.json`. It
speaks JSON-RPC 2.0 over stdio, exposes six workflow-state tools mapped 1:1 to the
workflow-state schema, and runs without any network listener.

The package source lives at
[`mcp/cursor-state-bridge/`](../mcp/cursor-state-bridge/README.md). Read
that README for the full tool surface, jail roots, environment variables,
and trace rotation policy.

## Why a bridge

Hooks under `hooks/` already read workflow-state. The bridge gives
agents a structured, schema-faithful way to **write** that state without
shelling out to the writer CLI. The executable implementation lives at `src/oh_my_cursor/workflow_state/`;
`.cursor/state/workflow-state.ts` stays only as a compatibility shim. The
bridge imports the packaged API directly so both writers go through one
implementation and one file lock.

## Boundary discipline

The bridge is shipped under the repo's claim/proof discipline:

- `repo-owned` — checked-in source under `mcp/cursor-state-bridge/`.
- `checked-in-artifact` — the structure validator
  ([`scripts/validate-mcp-server-structure.ts`](../scripts/validate-mcp-server-structure.ts))
  proves the package is present and well-formed; the smoke harness
  ([`scripts/smoke-mcp-cursor-state-bridge.ts`](../scripts/smoke-mcp-cursor-state-bridge.ts))
  proves the runtime contract end-to-end when `RUN_MCP_BRIDGE_SMOKE=1` is set.
- `runtime-smoke` — env-gated; the default install does not invoke the
  bridge, and the smoke is a fast no-op when the env gate is unset.

The default plugin install excludes `mcp/`. Users opt in with
`node --experimental-strip-types scripts/install-local-plugin.ts --with-mcp`. The user-environment
config file `.cursor/mcp.json` stays gitignored; the repo only ships the
template at `.cursor/mcp.example.json`.

## Documents

- [Tool surface table](./mcp-tool-surface.md) — six tools, all functional across phases 1–3, with phases 4–8 adding validation, trace, auth, history retention, and contract enforcement.
- [State contract](./state-contract.md) — workflow-state ownership and the
  bridge's role as the agent-callable writer.
- [Consensus plan](./plans/mcp-state-bridge-2026-05/consensus-plan.md) and
  [open questions](./plans/mcp-state-bridge-2026-05/open-questions.md) —
  the deliberate-mode ralplan that scoped this work into eight phases, plus
  the team-plan and team-verify handoffs under
  [`plans/mcp-state-bridge-2026-05/handoffs/`](./plans/mcp-state-bridge-2026-05/handoffs/).

## Quick start

```bash
# install opt-in
node --experimental-strip-types scripts/install-local-plugin.ts --with-mcp

# template-to-config (one time, from this trusted oh-my-cursor checkout)
cp .cursor/mcp.example.json .cursor/mcp.json   # edit placeholders if needed

# verify
node --experimental-strip-types scripts/validate-mcp-server-structure.ts
RUN_MCP_BRIDGE_SMOKE=1 node --experimental-strip-types scripts/smoke-mcp-cursor-state-bridge.ts --full --jail-escape --from-example
```

Reload Cursor; `cursor-state-bridge` appears in the MCP servers panel.

The checked-in templates launch the bridge from the active checkout. Use them
only when that checkout is the trusted `oh-my-cursor` payload; for any other
workspace, edit the command path so it points at the trusted plugin checkout or
installed payload, while `--workspace` continues to point at the target Cursor
workspace whose state should be read or written.

## What this bridge is not

- It is not a network server. It does not bind any TCP/UDP socket.
- It is not a knowledge base. It does not host notepad, wiki, or
  project-memory tools.
- It is not a code-execution surface. It does not expose ast-grep, LSP, or
  REPL tools.
- It is not the only writer. The packaged workflow-state API and the compatibility CLI shim share the
  same file lock, so a developer running the CLI directly does not race
  against the bridge.
