# Composer team launch — audit team mode & workflow policy (phase-controller)

This folder backs a **file-backed** multi-lane audit of the oh-my-cursor repo’s
team mode + workflow policy. There is no background worker pool; you run
parallel **Composer** chats yourself and merge results.

## Lead (this repo / one Composer tab)

- State file: `docs/plans/audit-team-mode-workflow-policy-202605/workflow-state.json`
- Optional: set a single active state path for hooks:

```bash
export OH_MY_CURSOR_WORKFLOW_STATE="$PWD/docs/plans/audit-team-mode-workflow-policy-202605/workflow-state.json"
```

## Workers (12 Composer tabs — scale in batches)

Open **twelve** new Composer sessions, **same workspace root** as this repo.
**Practical tip:** start **3–5 tabs at a time** to avoid overload; scopes are
partitioned so lanes rarely edit the same files.

When you start a task, set its JSON `status` from `pending` → `claimed` →
`in_progress`. When done, set to `completed` and fill `updated_at` plus
`evidence`.

| Tab | Agent | Task | Focus |
| --- | --- | --- | --- |
| A | @explore | T-001 | Core docs + key hooks (see below) |
| B | @security-reviewer | T-002 | Hooks + bridge + validator trust boundaries |
| C | @critic | T-003 | Docs vs implementation drift |
| D | @explore | T-004 | Remaining hooks (session/shell/subagent/…) |
| E | @verifier | T-005 | Workflow validators & smoke scripts |
| F | @code-reviewer | T-006 | Agents vs phase-controller table |
| G | @explore | T-007 | Skills: auto-execute, iterate-loop, verify, plan |
| H | @security-reviewer | T-008 | MCP bridge write path & jail |
| I | @critic | T-009 | AGENTS.md, README, confirmed-surfaces |
| J | @explore | T-010 | plugin.json + hooks.json wiring |
| K | @test-engineer | T-011 | tests/hooks vs hook behavior |
| L | @researcher | T-012 | Workflow-state path resolution across consumers |

### Optional: CLI fan-out (many processes)

If `cursor-agent` is installed and tasks are **read-only**, you may fan out
using `skills/parallel-batch/SKILL.md` (cap concurrency 3–5; log each run under
`.cursor-agent-logs/`). Composer tabs remain the default team mode in this repo.

---

### Tab A — @explore (T-001)

```
@explore
You are the explore worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-001.json
Scope: read-only inventory of team + workflow policy surfaces and enforcement points:
- docs/team-orchestration.md
- docs/orchestration.md
- docs/multi-state-compat.md
- skills/phase-controller/SKILL.md
- skills/parallel-batch/SKILL.md
- .cursor/hooks/{prompt-router.py,tool-guard.py,state-watcher.py,stop-gate.py}
Output: structured bullets with exact file references; call out “policy text” vs “enforced by code”.
Update the task JSON to completed with evidence paths.
```

### Tab B — @security-reviewer (T-002)

```
@security-reviewer
You are the security worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-002.json
Scope: trust boundaries for state + team files:
- .cursor/hooks/*.py (especially state-watcher.py and _active_role.py)
- mcp/cursor-state-bridge/ (state writes + jail semantics)
- scripts/validate-workflow-state.py
Output: severity-rated findings, citing file + line ranges where possible; propose smallest safe fix per issue.
Update the task JSON to completed with evidence paths.
```

### Tab C — @critic (T-003)

```
@critic
You are the critic worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-003.json
Scope: docs vs implementation drift for workflow policy + team mode:
- docs/orchestration.md claims vs actual hook scripts behavior
- docs/multi-state-compat.md claims vs actual validators and writers
- docs/team-orchestration.md vs actual “parallel-batch” posture
Output: list overclaims / mismatches with evidence; recommend wording fixes that preserve claim/proof discipline.
Update the task JSON to completed with evidence paths.
```

### Tab D — @explore (T-004)

```
@explore
You are the explore worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-004.json
Follow the task description exactly (remaining hooks). Read-only; update task JSON when done.
```

### Tab E — @verifier (T-005)

```
@verifier
You are the verifier worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-005.json
Follow the task description (validators & smoke vs contract). Read-only; update task JSON when done.
```

### Tab F — @code-reviewer (T-006)

```
@code-reviewer
You are the code-reviewer worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-006.json
Follow the task description (agents vs phase-controller). Read-only; update task JSON when done.
```

### Tab G — @explore (T-007)

```
@explore
You are the explore worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-007.json
Follow the task description (key skills vs state contract). Read-only; update task JSON when done.
```

### Tab H — @security-reviewer (T-008)

```
@security-reviewer
You are the security worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-008.json
Follow the task description (MCP bridge deep dive). Read-only; update task JSON when done.
```

### Tab I — @critic (T-009)

```
@critic
You are the critic worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-009.json
Follow the task description (AGENTS.md, README, confirmed-surfaces). Read-only; update task JSON when done.
```

### Tab J — @explore (T-010)

```
@explore
You are the explore worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-010.json
Follow the task description (plugin manifest + hooks.json). Read-only; update task JSON when done.
```

### Tab K — @test-engineer (T-011)

```
@test-engineer
You are the test-engineer worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-011.json
Follow the task description (tests/hooks coverage). Read-only; update task JSON when done.
```

### Tab L — @researcher (T-012)

```
@researcher
You are the researcher worker for team audit-team-mode-workflow-policy-202605.
Task: docs/plans/audit-team-mode-workflow-policy-202605/tasks/T-012.json
Follow the task description (workflow-state path resolution). Read-only; update task JSON when done.
```

## After workers finish

1. Lead merges findings into:
   - `docs/audits/team-mode-workflow-policy-audit-2026-05.md` (persistent audit note)
   - `docs/plans/audit-team-mode-workflow-policy-202605/workflow-state.json` (acceptance evidence)
2. Validate state:

```bash
python3 scripts/validate-workflow-state.py docs/plans/audit-team-mode-workflow-policy-202605/workflow-state.json
```
