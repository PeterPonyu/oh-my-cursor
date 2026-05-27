# cursor-state-bridge

A narrow stdio MCP server that owns writes to `.cursor/state/workflow-state.json`.

This package is the agent-callable entry point for the workflow-state contract
shipped under `.cursor/state/`. It speaks JSON-RPC 2.0 over standard input
and standard output, exposes a fixed six-tool surface, and never opens a
network listener.

## Status (PR1 + Phase 2 + Phase 3)

After Phase 3 all six advertised tools are functional:
`state_read`, `state_init`, `state_set_phase`, `state_record_failure`,
`state_update_acceptance_criterion`, `state_history_append`. There are
no `-32601` placeholders left for known tools; an unknown tool name
still returns `-32601` with an `unknown tool:` prefix.

The shared library lives at `src/oh_my_cursor/workflow_state/`
(`api.ts`, `cli.ts`, `locking.ts`). The legacy `.cursor/state/workflow-state.ts`
and `.cursor/state/_locking.ts` files are compatibility shims, so concurrent
bridge and CLI writers still serialise on one advisory lock per state file. `evidence` on
`state_update_acceptance_criterion` stays optional — the schema is not
tightened.

## Install (manual, opt-in)

The package is excluded from the default minimal plugin install. Two steps:

```bash
node --experimental-strip-types scripts/install-local-plugin.ts --with-mcp
```

Then create `.cursor/mcp.json` from the checked-in template in a trusted
`oh-my-cursor` checkout or installed payload:

```bash
cp .cursor/mcp.example.json .cursor/mcp.json
# edit the bridge command path if the target workspace is not this checkout
```

`.cursor/mcp.json` stays gitignored. Reload Cursor and the bridge appears
in the MCP servers panel.

Do not point the bridge command at an arbitrary project workspace. The command
must resolve to this repo's trusted `mcp/cursor-state-bridge/` payload; the
`--workspace` argument is the only value that should name the target workspace.

## Tool surface

| Tool | Status | Wraps (library API) |
| --- | --- | --- |
| `state_read` | functional (PR1) | `read_state()` |
| `state_init` | functional (Phase 2) | `init_state(...)` |
| `state_set_phase` | functional (Phase 2) | `set_state(phase=...)` |
| `state_record_failure` | functional (Phase 2) | `record_failure(...)` |
| `state_update_acceptance_criterion` | functional (Phase 3) | `update_acceptance_criterion(...)` |
| `state_history_append` | functional (Phase 3) | `append_history(...)` |
| `memory_notepad_read` | functional | `memory_io.ts` — read notepad sections |
| `memory_notepad_append_working` | functional | append one Working Memory line |
| `memory_project_memory_read` | functional | read `project-memory.json` |
| `memory_project_memory_set_directive` | functional | idempotent `userOwned.directives` append |
| `memory_wiki_log_append` | functional | append one `docs/wiki/log.md` line |

`evidence` on `state_update_acceptance_criterion` stays optional, matching
`.cursor/state/workflow-state.schema.json` exactly.

Memory tools use a workspace allowlist (`notepad.md`, `project-memory.json`,
`docs/wiki/log.md`) with realpath containment under the workspace root —
they do **not** use the workflow-state jail roots below.

## Jail roots (workflow-state tools only)

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
| `OH_MY_CURSOR_MCP_TOKEN` | unset (auth OFF) | When set, the bridge requires the same token in the `initialize` params or returns JSON-RPC `-32001` and refuses to advance the session. Defense-in-depth only — see [`docs/mcp-auth.md`](../../docs/mcp-auth.md). |
| `OH_MY_CURSOR_MCP_TRACE` | enabled (any value other than `0`/`false`/`no`/`off`) | Disables the JSONL trace lane when set to a falsey value. |
| `OH_MY_CURSOR_MCP_TRACE_FILE` | `<workspace>/.omcs/cursor-state-bridge/trace.jsonl` | Override target for trace records. |

## History retention (Phase 7)

Every write tool accepts an optional `history_cap` integer in its
`arguments` object. When omitted, the cap defaults to **1000**.
After each successful write, the library trims `history[]` to its
trailing `cap` entries (FIFO eviction — oldest dropped first), so the
on-disk file never grows unbounded over a long-lived task.

- `history_cap >= 1` — keep at most `history_cap` entries.
- `history_cap == 0` — opt out; no compaction.
- Negative values are normalised to opt-out.

The CLI shim accepts the same knob via `--history-cap N` on every
mutating subcommand (`init`, `set`, `ac`, `fail`, `history`).
Compaction always runs **before** the atomic tmp+rename, so concurrent
readers never observe a partially-evicted document. The
`scripts/validate-workflow-state.ts --check-history-cap N` flag asserts
the on-disk file satisfies the cap and stays monotonic.

## Trace lane (Phase 6)

The bridge writes one JSONL record per JSON-RPC call to
`.omcs/cursor-state-bridge/trace.jsonl` (dedicated subdirectory —
non-colliding with `.omcs/hook-trace.log`, which is owned by the hook
trace helper at `hooks/_trace.py`). Each record carries `ts`,
`tool`, `phase`, `result`, `duration_ms`, plus optional `task_id`,
`error_class`, and `args_digest`. The schema lives at
`fixtures/trace-schema.json` and is checked by
`scripts/validate-mcp-trace.py`.

Rotation: 10 MiB FIFO eviction. Opt out by setting
`OH_MY_CURSOR_MCP_TRACE=0` in the parent process environment.

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
node --experimental-strip-types scripts/validate-mcp-server-structure.ts
RUN_MCP_BRIDGE_SMOKE=1 node --experimental-strip-types scripts/smoke-mcp-cursor-state-bridge.ts --full --jail-escape --from-example
```

Each must exit 0. The default smoke (without the env gate) is a fast no-op
that prints `bounded: smoke gated by RUN_MCP_BRIDGE_SMOKE=1`.
