# Team mode & sub-agents

oh-my-cursor uses Cursor's native sub-agent system for parallel and
specialized work. There is no external team server, no background daemon,
and no cross-window orchestration — every agent runs as a Cursor sub-agent
within the same workspace.

## How it works

The `@phase-controller` skill reads the workflow state and dispatches
work to checked-in agents under `agents/`. Each agent is a self-contained
Cursor sub-agent with a defined role, tool allowlist, and lifecycle:

| Agent | Role | Phase |
|-------|------|-------|
| orchestrator | Entry-point coordinator | All phases |
| researcher | Codebase investigation | research |
| planner | Task breakdown | plan |
| implementer | Code changes | execute |
| verifier | Evidence checking | verify |
| critic | Architectural review | review |
| code-reviewer | Code quality review | review |
| security-reviewer | OWASP-aligned security | review |
| debugger | Root-cause analysis | any failure |
| tracer | Causal investigation | any failure |
| explore | File/pattern discovery | research |
| test-engineer | Test strategy and coverage | verify |

## Sub-agent lifecycle

Two hooks in `hooks/hooks.json` manage sub-agent sessions:

- **`subagentStart`** → `hooks/subagent-bootstrap.py` — fires when a
  sub-agent session opens. Checks the `subagent_type` against checked-in
  agent names and adds a short `user_message` pointing at the matching
  `agents/<role>.md` prompt.

- **`subagentStop`** → `hooks/subagent-summary.py` — fires when a
  sub-agent session ends. Emits an observational JSON summary of the
  recorded run. Never returns `followup_message`, so it does not consume
  the auto-follow-up loop budget.

Both hooks are fail-open — they never block sub-agent creation or
termination.

## Platform support

Cursor's sub-agent system is supported on all platforms:

| Platform | Sub-agents | Notes |
|----------|-----------|-------|
| **macOS** | ✅ Full support | Native Cursor feature |
| **Linux** | ✅ Full support | Cursor 2.0+ |
| **Windows** | ✅ Full support | Cursor 2.0+. If native team-mode windows are unavailable, sub-agents run within the single Cursor window via `@phase-controller` dispatch. |

**Windows note**: oh-my-cursor does not depend on Cursor's multi-window
team mode. All agents are invoked as sub-agents within the same Cursor
workspace through `@phase-controller`. This works on any platform that
Cursor supports.

## Claim/proof

- **Ownership class**: `repo-owned` — agent definitions are checked in
  under `agents/`, hooks under `hooks/`, and the phase-controller skill
  under `skills/phase-controller/SKILL.md`.
- **Proof class**: `checked-in-artifact` — all agent prompts, hook
  scripts, and routing logic are committed files.
- **Host-product-only**: sub-agent execution and lifecycle events are
  Cursor product capabilities. oh-my-cursor wires them but does not
  provision them.

## Related docs

- [`docs/orchestration.md`](./orchestration.md) — full lifecycle map
- [`hooks/README.md`](../hooks/README.md) — hook event reference
- [`skills/phase-controller/SKILL.md`](../skills/phase-controller/SKILL.md) — entry point
