# cursor-state-bridge

A narrow stdio MCP server that owns writes to `.cursor/state/workflow-state.json`.

This package is the agent-callable entry point for the workflow-state contract
shipped under `.cursor/state/`. It speaks JSON-RPC 2.0 over standard input
and standard output, exposes a fixed six-tool surface, and never opens a
network listener.

## Status (PR1)

PR1 ships the skeleton plus one functional tool (`state_read`). The other
five tools are advertised by `tools/list` but their handlers return JSON-RPC
error code `-32601` with the message `method not implemented in this PR
(Phase 3)`. This is intentional — Phase 2 lands the shared library refactor
and locking shim, and Phase 3 promotes the remaining five tools to functional.

## Install (manual, opt-in)

The package is excluded from the default minimal plugin install. Two steps:

```bash
./scripts/install-local-plugin.sh --with-mcp
```

Then create `.cursor/mcp.json` from the checked-in template:

```bash
cp .cursor/mcp.example.json .cursor/mcp.json
# edit ${workspaceFolder} placeholders if needed
```

`.cursor/mcp.json` stays gitignored. Reload Cursor and the bridge appears
in the MCP servers panel.

## Tool surface

| Tool | PR1 status | Wraps (Phase 2 library API) |
| --- | --- | --- |
| `state_read` | functional | `read_state()` |
| `state_init` | placeholder (`-32601`) | `init_state(...)` |
| `state_set_phase` | placeholder (`-32601`) | `set_state(phase=...)` |
| `state_record_failure` | placeholder (`-32601`) | `record_failure(...)` |
| `state_update_acceptance_criterion` | placeholder (`-32601`) | `update_acceptance_criterion(...)` |
| `state_history_append` | placeholder (`-32601`) | `append_history(...)` |

`evidence` on `state_update_acceptance_criterion` stays optional, matching
`.cursor/state/workflow-state.schema.json` exactly.

## Jail roots

The bridge resolves every read/write target with `os.path.realpath` and
asserts containment under one of three roots:

1. `<workspace>/.cursor/state/`
2. `<workspace>/docs/plans/`
3. `<workspace>/.omcs/cursor-state-bridge/`

Targets outside these roots return JSON-RPC error code `-32602` with a
message starting `jail-escape:`.

## Environment variables

| Variable | Default | Effect |
| --- | --- | --- |
| `OH_MY_CURSOR_MCP_TOKEN` | unset | If set, the bridge requires the matching token in `initialize` params (Phase 6). PR1 does not enforce this. |

## Trace rotation policy (Phase 6)

When the trace lane lands in Phase 6, the bridge will write structured
events to `.omcs/cursor-state-bridge/trace.jsonl` (note the dedicated
subdirectory — non-colliding with `.omcs/hook-trace.log`, which is owned by
the hook trace helper at `.cursor/hooks/_trace.py`). Rotation policy:
10 MiB cap with FIFO eviction. The schema lives at `fixtures/trace-schema.json`.

## Boundary

| Surface | Status |
| --- | --- |
| `mcp/cursor-state-bridge/**` | repo-owned, checked-in-artifact |
| `.cursor/mcp.example.json` | repo-owned, checked-in-artifact |
| `.cursor/mcp.json` | gitignored, never tracked, validator-rejected |
| `.omcs/cursor-state-bridge/` | runtime workspace-private trace target only — not a checked-in repo-owned surface |
| Network listeners | unsupported-or-out-of-scope |
| Marketplace publication | unsupported-or-out-of-scope |

## Verifying the install

```bash
python3 scripts/validate-mcp-server-structure.py
RUN_MCP_BRIDGE_SMOKE=1 ./scripts/smoke-mcp-cursor-state-bridge.sh --full --jail-escape --from-example
python3 -m unittest discover -s mcp/cursor-state-bridge/tests -p 'test_*.py'
```

Each must exit 0. The default smoke (without the env gate) is a fast no-op
that prints `bounded: smoke gated by RUN_MCP_BRIDGE_SMOKE=1`.
