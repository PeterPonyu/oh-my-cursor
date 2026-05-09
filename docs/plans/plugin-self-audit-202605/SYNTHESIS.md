# Self-audit synthesis: oh-my-cursor (plugin-self-audit-202605)

Date: 2026-05-09

This synthesis merges three read-only lanes:

- T-001: explore inventory + drift scan
- T-002: security review (hooks, MCP bridge, scripts)
- T-003: critic review (docs vs implementation / claim-proof drift)

## 1) Inventory (skills, agents, hooks, plugin wiring)

### Skills (14)

Found 14 checked-in skills under `skills/*/SKILL.md`:

- `skills/phase-controller/` (orchestration entry)
- `skills/plan/`
- `skills/iterate-loop/`
- `skills/review/`
- `skills/security-review/`
- `skills/auto-execute/`
- `skills/local-plugin-check/`
- `skills/deep-interview/`
- `skills/doctor/`
- `skills/mcp-setup/`
- `skills/verify/`
- `skills/debug/`
- `skills/trace/`
- `skills/parallel-batch/`

### Agents (12)

Found 12 checked-in agents under `.cursor/agents/*.md`:

- `orchestrator` (RW; MCP read/write)
- `implementer` (RW)
- `test-engineer` (RW)
- `debugger` (RW)
- `researcher` (RO)
- `explore` (RO)
- `planner` (RO)
- `verifier` (RO + Bash)
- `critic` (RO)
- `code-reviewer` (RO)
- `security-reviewer` (RO)
- `tracer` (RO)

### Plugin + hooks wiring

- Plugin manifest: `.cursor-plugin/plugin.json` points to:
  - `rules` (repo `rules/`)
  - `skills` (`skills/`)
  - `agents` (`.cursor/agents/`)
  - `hooks` (`.cursor/hooks.json`)
  - MCP template (`.cursor/mcp.example.json`)
- Hooks manifest: `.cursor/hooks.json` references 14 python scripts under `.cursor/hooks/` and all referenced script paths exist.

### Drift risk: rules path ambiguity

The plugin manifest points rules at `rules/`, while additional rule files live under `.cursor/rules/`. This can confuse which rules are “plugin-loaded” vs “workspace-loaded” unless the host separately loads `.cursor/rules/*`.

## 2) Security findings

### HIGH

- **Hook path traversal / jail mismatch**: `.cursor/hooks/state-watcher.py` builds a bridge-target path from `task_id` without applying the MCP bridge jail semantics (`resolve_jailed`). If `task_id` contains `..` segments and is present in the `postToolUse` payload for bridge writes, the hook can attempt to read outside the intended `docs/plans/<task_id>/` subtree.
  - Smallest fix: normalize + enforce containment under `ROOT/docs/plans/` (or reuse bridge `resolve_jailed` logic) before reading.

### MEDIUM

- **Role path traversal via active role file**: `.cursor/hooks/_active_role.py` reads `.cursor/agents/{role}.md` without validating that `role` is a safe single path segment. A tampered `active-role.json` could redirect reads outside the agents directory.
  - Smallest fix: reject role strings containing `/`, `\\`, or `..`, or enforce `agent_file.resolve().is_relative_to(AGENTS_DIR.resolve())`.

- **MCP auth default open + workspace override** (configuration risk): `mcp/cursor-state-bridge/auth.py` allows all calls when `OH_MY_CURSOR_MCP_TOKEN` is unset; `state_read` accepts a `workspace` override parameter. Jailing still applies per-workspace, but on shared machines this can enable cross-workspace reads/writes via stdio clients.
  - Smallest fix: document clearly; consider disabling `workspace` override unless token auth is enabled.

## 3) Docs / claim-proof mismatches (audit risks)

### Blocking issues for “orchestration contract” accuracy

- **Per-task bridge paths vs hook defaults**:
  - `mcp/cursor-state-bridge/state_io.py` defaults `state_init` to writing per-task state (`docs/plans/<task_id>/workflow-state.json`) unless `scope_per_task: false`.
  - `stop-gate.py` only falls back to `.cursor/state/workflow-state.json` (unless env/payload overrides).
  - `session-bootstrap.py` and `session-summary.py` do not include the canonical default fallback; they only resolve via env/payload.
  - Impact: without `OH_MY_CURSOR_WORKFLOW_STATE` set, hooks can disagree about where the “active state” lives.

- **`docs/multi-state-compat.md` retention + enforcement claims drift**:
  - Doc claims `history[]` capped at 50 and “full history preserved in MCP log”.
  - Code defaults are 1000 (`DEFAULT_HISTORY_CAP = 1000`) and compaction drops old entries; there is no checked-in “full history archive” path.
  - Doc also states tools/validator enforce transition graph; the current shared library + validator enforce enums/shape, not a transition matrix.

### Needs-changes issues

- `docs/orchestration.md` skills table is incomplete (claims 14 but lists fewer) and incorrectly includes `code-reviewer` as a skill (it is an agent).
- `docs/orchestration.md` hook→skill wiring table overstates what several hooks do (e.g. “initializes workflow-state”, “captures shell output into workflow-state”) vs the hook scripts’ actual observational behavior.

## 4) Evidence: validators and smoke (AC-004)

All ran successfully from repo root:

- `python3 scripts/validate-cursor-workflow-artifacts.py` → `HOOKS_ARTIFACTS_OK`, `AGENTS_ARTIFACTS_OK`
- `./scripts/smoke-cursor-workflow-artifacts.sh` → `CURSOR_WORKFLOW_ARTIFACTS_SMOKE_OK`
- `python3 scripts/validate-workflow-state.py docs/plans/plugin-self-audit-202605/workflow-state.json` → `WORKFLOW_STATE_OK`

## Recommended next step (if you want this audit to land as fixes)

Run an `iterate-loop` scoped to:

1. Unify workflow-state path resolution across hooks + bridge (per-task vs canonical) and update docs to match.
2. Harden `state-watcher.py` and `_active_role.py` path handling to mirror bridge containment rules.
3. Repair `docs/orchestration.md` inventory tables (skills vs agents) and hook behavior descriptions so they match checked-in scripts.

