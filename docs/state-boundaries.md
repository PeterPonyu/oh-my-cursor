# State boundaries

Two state directories may appear in a workspace that uses this Cursor port
together with the user's global oh-my-claudecode (OMC) harness. They are
**independent systems**; this repo owns only one.

| Path | Owner | Purpose | Status here |
| --- | --- | --- | --- |
| `.cursor/state/` | `oh-my-cursor` (this repo) | Workflow-state contract: phase, status, acceptance criteria, history, plus active subagent role tracking. | First-class. Schema-bounded, read by 14 hooks, written by the workflow-state package/CLI or the `cursor-state-bridge` MCP tools under a shared `file_lock`. |
| `.omc/state/` | Global OMC harness (`~/.claude/CLAUDE.md`) | Mission state, subagent tracking, HUD cache, agent replay logs for OMC's runtime. | Out of scope. Not read, written, or contracted by this repo. |

## What lives where

### `.cursor/state/` (this repo)

- `workflow-state.json` — current task's phase, acceptance criteria, history,
  failure metadata. Schema in `workflow-state.schema.json`.
- `active-role.json` — single-active-subagent record consulted by
  `tool-guard.ts` to enforce per-role tool allowlists declared in
  `agents/*.md` frontmatter.
- `workflow-state.example.json` — reference document; not live state.

### `.omc/state/` (out of scope)

- `mission-state.json`, `subagent-tracking.json`, `agent-replay-*.jsonl`,
  `hud-stdin-cache.json`, etc. — managed by the OMC harness loaded from the
  user's `~/.claude/CLAUDE.md`. Treat as opaque scratch from the perspective
  of this repo's hooks, agents, and skills.

## Decision rule

When you need to add cross-system state, **extend `.cursor/state/`**. Do not
read or write `.omc/state/*` from any hook, skill, or agent in this repo.
The OMC harness is upstream and changes on its own cadence; coupling this
port to its internal layout would create a moving target.

## Read vs write split

- Hooks **read** `workflow-state.json` directly off disk. Writers always
  settle the file with `os.replace` before releasing the shared `file_lock`,
  so a hook never observes a partial document.
- Hooks **never write** workflow state. Writes go through one of two paths:
  - the packaged library API in `src/oh_my_cursor/workflow_state/` through the CLI shim, or
  - the `cursor-state-bridge` MCP tools (agent-callable, lock-shared).
  Both paths import the same `file_lock` callable identity via the
  module-cache trick in `mcp/cursor-state-bridge/state_io.ts`.
- Direct edits to `workflow-state.json` from any tool that is not one of
  these two writers are intercepted by `tool-guard.ts` and require user
  confirmation.

## See also

- [`.cursor/state/README.md`](../.cursor/state/README.md) — schema, files,
  usage notes for the workflow-state contract.
- [`docs/mcp-tool-surface.md`](./mcp-tool-surface.md) — the six MCP tools the
  bridge exposes.
- [`docs/state-contract.md`](./state-contract.md) — narrative description of
  the state contract.
