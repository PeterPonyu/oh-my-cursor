# Cursor native hook mapping

Status: Canonical mapping of oh-my-cursor hooks to Cursor IDE native events.

This page answers: which hooks run on Cursor's native hook API, which run as python scripts, and which are not supported yet?

## Install surface

This repo ships `hooks/hooks.json` which wires fourteen Cursor hook events to stdlib-only Python scripts under `hooks/`. The install script copies `hooks/hooks.json` and `hooks/` into `~/.cursor/plugins/local/oh-my-cursor/`.

Cursor reads `.cursor/hooks.json` at session start. All hook scripts are fail-open: they observe, log, and warn, but do not block the session unless a tightly bounded severe pattern is detected.

## Ownership split

| Surface | Owner | Path |
|---|---|---|
| Cursor native hooks | Cursor product (host) | `.cursor/hooks.json` |
| oh-my-cursor hook scripts | repo-owned plugin payload | `hooks/*.py` |
| Runtime state (never durable) | local workspace | `.cursor/state/workflow-state.json`, `.cursor/state/active-role.json`, `*.lock` |
| Agent-callable state writes | cursor-state-bridge MCP | `mcp/cursor-state-bridge/` |

## Mapping matrix

Fourteen wired Cursor hook events mapped to scripts:

| Cursor Hook Event | Script | Role | Mode |
|---|---|---|---|
| `sessionStart` | `session-bootstrap.py` | Confirms workspace state, loaded rules, active workflow-state file. | Observational |
| `sessionEnd` | `session-summary.py` | Summarizes session activity and acceptance-criteria status. | Observational |
| `beforeSubmitPrompt` | `prompt-router.py` | Detects ambiguous prompts, suggests clarification before routing. | Observational (warn) |
| `preToolUse` | `tool-guard.py` | Enforces tool allowlists per active role; blocks disallowed tools. | Active (may block) |
| `postToolUse` | `state-watcher.py` | Reads workflow-state after tool use; flags stale or contradictory state. | Observational |
| `postToolUseFailure` | `failure-router.py` | Routes failures to debugger or tracer based on failure type. | Observational (route) |
| `subagentStart` | `subagent-bootstrap.py` | Records active subagent role in `active-role.json`. Tool-guard reads this. | Writer (state) |
| `subagentStop` | `subagent-summary.py` | Clears active-role on subagent completion. | Writer (state) |
| `beforeShellExecution` | `shell-guard.py` | Warns on destructive shell patterns (`rm -rf`, force-push). | Observational (warn) |
| `afterShellExecution` | `shell-debrief.py` | Logs shell command outcomes for traceability. | Observational |
| `beforeReadFile` | `read-advisor.py` | Suggests skipping when a file is already in context or unchanged. | Advisory |
| `afterFileEdit` | `claim-guard.py` | Scans edits for claim inflation (upgrading host-product-only → repo-owned). | Observational (warn) |
| `preCompact` | `compact-reminder.py` | Surfaces pending acceptance criteria and active failures before context compaction. | Observational |
| `stop` | `stop-gate.py` | Checks workflow-state for pending/failed criteria. Emits reminder; does not block. Loop limit: 1. | Observational |


## What is NOT native yet

- **Agent-callable state writes**: Not a Cursor hook — goes through `cursor-state-bridge` MCP (opt-in)
- **Background daemon or retry loop**: Not supported; Cursor has no background-worker hook
- **Custom mode provisioning**: Cursor custom modes are host-product-only; this repo does not ship a mode config format
- **Keyword detector**: Cursor has no `UserPromptSubmit`-style hook for skill auto-activation; orchestration is explicit via `phase-controller` skill invocation
- **Automatic phase advancement**: Phases advance only by explicit action on `workflow-state.json` via MCP bridge tools

## Upstream Cursor capability surface

Referenced from `docs/references.md` (Cursor documentation):

| Capability | Ownership | Cursor Feature | Hook Event |
|---|---|---|---|
| Project hooks | host-product-only | `.cursor/hooks.json` | sessionStart..stop |
| Custom agents | host-product-only | `agents/` | subagentStart, subagentStop |
| Custom modes | host-product-only | Cursor settings UI | N/A (no hook) |
| Background agents | unsupported-or-out-of-scope | N/A | N/A |
