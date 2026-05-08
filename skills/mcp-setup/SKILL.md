---
name: mcp-setup
description: Setup and verification guide for the cursor-state-bridge MCP server.
---

# MCP Setup

> **Cursor host note.** This is a diagnostic-first setup guide for the repo-owned `cursor-state-bridge` MCP server. It checks checked-in artifacts, explains the opt-in install path, and verifies the documented six-tool surface when the Cursor host exposes it. It cannot force Cursor to load an MCP server and it does not claim host-product state without evidence from the user's Cursor UI or MCP tool panel.

## Governance

### Ownership Class
- **repo-owned**: YES — Checked in at `skills/mcp-setup/SKILL.md` as a diagnostic-first setup guide for the cursor-state-bridge MCP server.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: NO — Cursor does not document MCP setup; this is repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/mcp-setup/SKILL.md`, `mcp/cursor-state-bridge/`, `.cursor/mcp.example.json`, validators.
- **runtime-smoke**: YES (optional) — Runs `validate-mcp-server-structure.py` and smoke test; MCP bridge is opt-in via `--with-mcp` install.

### Claim Summary
This skill is a diagnostic-first setup guide for the repo-owned `cursor-state-bridge` MCP server. It checks checked-in artifacts, explains the opt-in install path, and verifies the documented six-tool surface when the Cursor host exposes it. No MCP tools required to run this skill; it sets up MCP for other skills.

## MCP Integration Points

| Tool/Resource | MCP Server | Purpose | Required | Status |
|---|---|---|---|---|
| All six tools | cursor-state-bridge | Verified when bridge is installed | No | optional |

**Note**: This skill sets up MCP; it does not require MCP to run.

## Hooks Dependencies

No hooks dependencies. This skill runs entirely within the Cursor chat.

## Orchestration Role

- **Lifecycle phase(s)**: intake
- **Invoked by**: User, `verify` or `auto-execute` when MCP tools are unavailable
- **Invokes**: No other skills; runs diagnostics and setup steps
- **State contract**: No workflow-state updates; reports to chat
- **Failure handling**: Reports missing prerequisites; does not auto-install

## Use when

- The user wants to enable `cursor-state-bridge` for workflow-state updates.
- `verify`, `auto-execute`, or another state-aware workflow reports that MCP
  bridge tools are unavailable.
- A contributor wants to confirm the bridge package, local plugin install, and
  Cursor MCP config are wired correctly.
- After pulling changes that modify `mcp/cursor-state-bridge/`,
  `.cursor/mcp.example.json`, or the bridge scripts.

## Skip when

- The task only needs read-only diagnosis of the whole repo; use `doctor`.
- The bridge is already visible and all six tools work; continue the original
  workflow.
- The user does not want the optional MCP package installed. Default plugin
  install excludes `mcp/` by design.

## Diagnostic-first workflow

1. **Confirm repo context.** Check that the workspace contains the repo-owned
   bridge artifacts: `mcp/cursor-state-bridge/`, `.cursor/mcp.example.json`,
   `scripts/install-local-plugin.sh`,
   `scripts/validate-mcp-server-structure.py`, and
   `scripts/smoke-mcp-cursor-state-bridge.sh`.
2. **Check prerequisites before fixing.** Confirm that local shell access can
   run `python3`, execute repo scripts, and read `.cursor/`. If a prerequisite
   is missing, report it before suggesting install steps.
3. **Check local plugin install mode.** The normal install path excludes
   `mcp/`. To include the bridge, run:

   ```bash
   ./scripts/install-local-plugin.sh --with-mcp
   ```

   Report whether the install was already present, newly run, or skipped by
   user choice.
4. **Create host config from the template.** If `.cursor/mcp.json` does not
   exist, copy the repo template:

   ```bash
   cp .cursor/mcp.example.json .cursor/mcp.json
   ```

   Then edit placeholders if the template requires local absolute paths. Keep
   `.cursor/mcp.json` as user-environment config; it is not a checked-in repo
   artifact.
5. **Validate checked-in server structure.** Run:

   ```bash
   python3 scripts/validate-mcp-server-structure.py
   ```

   This proves the repo-owned package is present and well-formed. Failure here
   is repo-owned and should be fixed in the repo.
6. **Run the env-gated smoke harness.** Run:

   ```bash
   RUN_MCP_BRIDGE_SMOKE=1 ./scripts/smoke-mcp-cursor-state-bridge.sh --full --jail-escape --from-example
   ```

   This proves the stdio JSON-RPC runtime contract when the local environment
   can execute the server. If the env gate is not set, the smoke is expected
   to be a no-op; do not report that as a full pass.
7. **Verify Cursor host exposure.** Reload Cursor and inspect the MCP servers
   panel. Confirm `cursor-state-bridge` is listed and enabled. This is
   host-product-only evidence; the repo cannot guarantee it from checked-in
   files alone.
8. **Verify the six-tool surface.** From the Cursor MCP tool surface, confirm
   these tools are callable:
   - `state_read`
   - `state_init`
   - `state_set_phase`
   - `state_record_failure`
   - `state_update_acceptance_criterion`
   - `state_history_append`

   At minimum, call `state_read` against the current workspace. For a full
   functional check, use a disposable task id or test workspace state and
   exercise the write tools through the bridge, never by editing
   `workflow-state.json` directly.

## Ownership map

| Surface | Ownership | What can be claimed |
|---------|-----------|---------------------|
| `mcp/cursor-state-bridge/**` | repo-owned | Checked-in server source exists. |
| `scripts/validate-mcp-server-structure.py` | repo-owned | Package structure validates. |
| `scripts/smoke-mcp-cursor-state-bridge.sh` | repo-owned | Runtime contract passes when env-gated smoke runs. |
| `.cursor/mcp.example.json` | repo-owned | Template exists for user config. |
| `.cursor/mcp.json` | host/user environment | Local Cursor config derived from template. |
| Cursor MCP servers panel | host-product-only | Bridge is loaded and tools are visible in Cursor. |

## Report format

```
MCP SETUP REPORT
================

Summary: READY | PARTIAL | NOT READY

| Check | Status | Ownership | Details |
|-------|--------|-----------|---------|
| Bridge package | OK / FAIL | repo-owned | <path or issue> |
| Plugin install with mcp | OK / WARN / SKIPPED | host/user | <install result> |
| MCP config | OK / WARN / MISSING | host/user | .cursor/mcp.json status |
| Structure validator | OK / FAIL / SKIPPED | repo-owned | exit code and first error |
| Smoke harness | OK / FAIL / SKIPPED | repo-owned + runtime | exit code and mode |
| Cursor host exposure | OK / WARN / UNKNOWN | host-product-only | user-visible status |
| Six-tool surface | OK / FAIL / UNKNOWN | host-product-only | listed tools |

Next steps
----------
- <smallest action for each WARN, FAIL, MISSING, or UNKNOWN>
```

## Rules and boundaries

- Check before fixing. Do not run install or copy config until the current
  state is known and the user wants setup changes.
- Do not edit workflow-state files directly. The bridge is the sanctioned
  writer for workflow-state updates.
- Do not claim the MCP server is loaded in Cursor unless the host exposes it
  or the user confirms it from the Cursor UI.
- Do not treat `.cursor/mcp.json` as a repo-owned artifact. The repo ships
  `.cursor/mcp.example.json`; local config belongs to the user's environment.
- Do not broaden the bridge's scope. It is a stdio JSON-RPC server for
  workflow-state management, not a network server, code execution surface, or
  knowledge base.
- If a command cannot run because the host lacks prerequisites, mark it
  `SKIPPED` with the reason instead of inventing a pass.

## Stop conditions

- Structure validator, smoke harness, host exposure, and six-tool visibility
  have all been reported.
- A missing prerequisite prevents meaningful continuation.
- The user declines the optional `--with-mcp` install path.
- The user says to stop.
