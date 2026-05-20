# Composer team launch (phase-controller)

This folder backs a **file-backed** multi-lane audit of the oh-my-cursor repo. There is no background worker pool; you run parallel **Composer** chats yourself and merge results.

## Lead (this repo / one Composer tab)

- State file: `docs/plans/plugin-self-audit-202605/workflow-state.json`
- Optional: `export OH_MY_CURSOR_WORKFLOW_STATE="$PWD/docs/plans/plugin-self-audit-202605/workflow-state.json"` so hooks resolve the same file.

## Workers (three Composer tabs)

Duplicate the prompt block below into **three** new Composer sessions, **same workspace root** (`oh-my-cursor`). Set the task file to `claimed` → `in_progress` in JSON when you start; `completed` when done.

### Tab A — @explore (T-001)

```
@explore
You are the explore worker for team plugin-self-audit-202605.
Task: docs/plans/plugin-self-audit-202605/tasks/T-001.json
Scope: read-only inventory of skills/, .cursor/agents/, .cursor/hooks.json + .cursor/hooks/, .cursor-plugin/plugin.json.
Output: structured bullets; cite paths. Update task file status when finished.
```

### Tab B — @security-reviewer (T-002)

```
@security-reviewer
You are the security worker for team plugin-self-audit-202605.
Task: docs/plans/plugin-self-audit-202605/tasks/T-002.json
Scope: .cursor/hooks/*.py, mcp/cursor-state-bridge/, scripts/*.sh — trust boundaries, injection, path tricks.
Output: severity-rated findings with path:line. Update task file status when finished.
```

### Tab C — @critic (T-003)

```
@critic
You are the critic worker for team plugin-self-audit-202605.
Task: docs/plans/plugin-self-audit-202605/tasks/T-003.json
Scope: docs/orchestration.md, docs/multi-state-compat.md, skills/phase-controller/SKILL.md vs implementation.
Output: overclaims / drift with evidence. Update task file status when finished.
```

## After workers finish

1. Lead merges findings into chat or `docs/plans/plugin-self-audit-202605/SYNTHESIS.md`.
2. Update `workflow-state.json` acceptance criteria with evidence paths or command logs.
3. Run: `python3 scripts/validate-workflow-state.py docs/plans/plugin-self-audit-202605/workflow-state.json` and project smoke scripts per AC-004.
