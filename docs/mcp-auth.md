# `cursor-state-bridge` auth and threat model

`cursor-state-bridge` ships an optional, parent-process-trusted auth
shake.  It is **defense-in-depth only**.  The token **does NOT protect against parent-process compromise**.

## How the shake works

| Setting | Behaviour |
| --- | --- |
| `OH_MY_CURSOR_MCP_TOKEN` unset | Default mode.  The bridge accepts every `initialize` request without checking a token.  This is the documented baseline for users who launch the bridge from a trusted developer workstation. |
| `OH_MY_CURSOR_MCP_TOKEN=<token>` exported in the parent process before launching the bridge | The bridge reads the value at startup.  Subsequent `initialize` requests must carry `params.token == <token>` or the bridge responds with JSON-RPC error code `-32001` and refuses to advance to `tools/list` or `tools/call`. |

The token never leaves the parent process and is not logged.  The
bridge does not read it from any file.

## Threat model

**What this defends against.**
The token raises the bar for an unrelated process on the same host that
opens the bridge's stdio pair (e.g. via misconfigured supervisor
plumbing) and tries to issue arbitrary `initialize` requests.  Without
the token, that hypothetical caller cannot complete the handshake.

**What this does NOT defend against.**
This is **defense-in-depth only**, not perimeter security:

- **Parent-process compromise.**  If the process that launched the
  bridge is compromised, the attacker already has the token (it is
  exported in that process's environment) and can impersonate the
  legitimate caller.  The token does NOT protect against
  parent-process compromise.
- **`/proc` / `ps` leakage.**  On Linux, environment variables are
  visible through `/proc/<pid>/environ` to the same UID.  A local
  attacker with the same UID can read the token.  Use OS-level
  isolation (different UIDs, container boundaries) when this matters;
  see the operational guidance below.
- **MITM on stdio.**  The bridge speaks plain JSON over stdin/stdout.
  Anything that sits between the parent and the bridge sees the token
  during `initialize`.

## Operational guidance

- Prefer launching the bridge from your editor's native MCP launcher,
  which keeps the env scoped to the bridge process and does not
  re-export the token.
- When you must scaffold the env yourself, prefer Cursor's secret-store
  injection (or the equivalent on your platform) over a literal value
  in `.cursor/mcp.json`.  The checked-in template at
  `.cursor/mcp.example.json` carries `<placeholder>` precisely so users
  do not commit real tokens.
- `.cursor/mcp.json` is gitignored and is rejected by
  `scripts/validate-plugin-structure.sh` if accidentally tracked.

## Why default OFF

The bridge is meant to be installed by the user explicitly via
`./scripts/install-local-plugin.sh --with-mcp` and then launched from a
trusted parent (an editor or CI runner the user controls).  Requiring
auth by default would raise the floor for every user who does not need
it, while still leaving the higher-value attack surface
(parent-process compromise) unaddressed.  Auth therefore stays opt-in.

## Verification

```bash
# default mode: smoke succeeds without any token
unset OH_MY_CURSOR_MCP_TOKEN
RUN_MCP_BRIDGE_SMOKE=1 ./scripts/smoke-mcp-cursor-state-bridge.sh --auth

# enforced mode: smoke fails (-32001) without the token in initialize params
OH_MY_CURSOR_MCP_TOKEN=demo-token \
RUN_MCP_BRIDGE_SMOKE=1 ./scripts/smoke-mcp-cursor-state-bridge.sh --auth-enforced
```

Both modes are documented as `runtime-smoke` proof; the default mode is
gated by `RUN_MCP_BRIDGE_SMOKE=1`.
