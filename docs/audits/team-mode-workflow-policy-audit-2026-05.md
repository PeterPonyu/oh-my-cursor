# Team mode & workflow policy audit (2026-05)

Access date: **2026-05-09**.

This audit maps the current codebase’s **team mode** and **workflow policy** to
their concrete repo-owned artifacts, and calls out policy / enforcement drift.

## Scope

- **In scope**: repo-owned policy surfaces (docs, skills, agents, hooks,
  validators), plus the repo’s bounded “team mode” conventions.
- **Out of scope**: Cursor host product capabilities that are not provisioned by
  this repo (background agents, remote queues, implicit cross-session resume).

## Definitions (as implemented in this repo)

- **Workflow policy**: the repo-owned state machine and evidence discipline that
  coordinates hooks/skills/agents via a file-backed JSON document.
  - Contract: `.cursor/state/workflow-state.schema.json`
  - Example: `.cursor/state/workflow-state.example.json`
  - Overview: `docs/orchestration.md`
- **Team mode**: a repo-owned *coordination protocol* for multi-lane work that
  remains **opt-in** and **file-backed**; it is not a background worker pool.
  - Baseline contract: `docs/team-orchestration.md`
  - Example “team launch” plan: `docs/plans/plugin-self-audit-202605/README-team-launch.md`
  - Parallel primitive (optional, host-provided): `skills/parallel-batch/SKILL.md`

## Repo-owned policy surfaces (source of truth)

### Workflow state contract (repo-owned, checked-in-artifact)

- **Schema**: `.cursor/state/workflow-state.schema.json`
- **Local validator**: `scripts/validate-workflow-state.ts`
- **Read-only hook validators**: `hooks/state-watcher.ts` (observes and
  validates after edits/writes), `hooks/stop-gate.ts` (stop reminder),
  `hooks/prompt-router.ts` (routing hints + state summary)
- **Write paths**:
  - Agent-callable (opt-in): `mcp/cursor-state-bridge/` (see `docs/orchestration.md`)
  - Developer terminal fallback: `scripts/workflow-state.ts` (`.cursor/state/workflow-state.ts` compatibility shim) (see
    `.cursor/state/README.md` and `docs/orchestration.md`)

### Phase routing & roles (repo-owned, checked-in-artifact)

- **Phase controller skill**: `skills/phase-controller/SKILL.md`
- **Entry-point agent**: `agents/orchestrator.md`
- **Role prompts**: `agents/*.md` (planner/implementer/verifier/etc.)

### Team delivery protocol (repo-owned, checked-in-artifact)

Team tasks are defined as **individual JSON files** under a plan folder:

- **Format + transitions**: `docs/team-orchestration.md`
- **Example tasks**: `docs/plans/plugin-self-audit-202605/tasks/*.json`

Team mode is explicitly designed to integrate with workflow-state:

- Lead phase stays in workflow-state (`.cursor/state/workflow-state.json` or a
  per-task archive under `docs/plans/<task-id>/workflow-state.json`)
- Worker delivery lives in `docs/plans/<team-id>/tasks/*.json`

## Host-product-only execution primitives (not repo-owned)

The repo’s “team mode” requires a host execution surface to actually run work in
parallel. The current codebase supports two operator-driven options:

- **Manual multi-tab Composer** (“team launch”): see
  `docs/plans/plugin-self-audit-202605/README-team-launch.md`.
- **Cursor CLI fan-out** (optional): `skills/parallel-batch/SKILL.md` uses
  `cursor-agent` when installed; otherwise it explicitly downgrades to
  sequential execution.

## Enforcement & guardrails (what is actually enforced)

- **No hidden background runner**: stated consistently in `docs/orchestration.md`,
  `skills/phase-controller/SKILL.md`, and `docs/team-orchestration.md`.
- **State writes are bounded**:
  - Hooks are read-only observers (`hooks/README.md`).
  - `tool-guard.ts` prompts for confirmation on direct edits to
    `workflow-state.json` (`hooks/tool-guard.ts`).
- **Schema shape is enforced; transition semantics are mostly “by convention”**:
  - The validator enforces enums + shape (`scripts/validate-workflow-state.ts`).
  - The transition matrix lives as policy text (`docs/multi-state-compat.md`)
    and is not fully enforced by the validator.

## Drift / risk findings (current, evidence-backed)

This repo already has a “self-audit synthesis” that identifies concrete drift
risks and security findings. Relevant excerpts for team mode / workflow policy:

- **Workflow-state path ambiguity / multi-path resolution drift**:
  `docs/plans/plugin-self-audit-202605/SYNTHESIS.md`
- **Multi-state compat claims drift** (history cap, enforcement claims):
  `docs/plans/plugin-self-audit-202605/SYNTHESIS.md` and `docs/multi-state-compat.md`
- **Hook read-path safety risks** (path containment issues when deriving paths):
  `docs/plans/plugin-self-audit-202605/SYNTHESIS.md`

## Recommendations (policy-level, repo-owned)

1. **Make the “active workflow-state path” unambiguous** across hooks, docs, and
   the bridge default resolution order (canonical vs per-task archive).
2. **Align multi-state compat claims with implementation** (history cap and
   what is actually enforced vs “by convention”).
3. **Harden hook path handling** to match the bridge jail semantics for any
   derived path (especially when interpolating `task_id`).

## Initial Research Findings (Lead/Orchestrator pass, 2026-05-09)

**Evidence sources read**: `hooks/hooks.json`, `.cursor/state/workflow-state.json`, `docs/plans/audit-team-mode-workflow-policy-202605/workflow-state.json`, `docs/team-orchestration.md`, `docs/orchestration.md`.

### Key observations (repo-owned surfaces confirmed)
- The source hooks/hooks.json declares exactly **14** event-driven hooks (sessionStart through stop). All point to `node --experimental-strip-types hooks/*.ts`. No long-running or daemon entry exists in the manifest.
- The 12 task JSON files (T-001..T-012) provide non-overlapping coverage that matches the surfaces enumerated in `docs/orchestration.md` (hooks, skills, agents, validators, MCP bridge, plugin manifest, root policy docs).
- Both the canonical `.cursor/state/workflow-state.json` and the per-task `docs/plans/audit-team-mode-workflow-policy-202605/workflow-state.json` are valid per `scripts/validate-workflow-state.ts` and follow the schema (phase=research, status=in_progress, role=orchestrator, history monotonic).
- Team delivery state lives in individual `tasks/T-NNN.json` files; workflow-state tracks the lead phase and acceptance criteria. This separation is explicitly documented in `docs/team-orchestration.md` and `docs/multi-state-compat.md`.

### No overclaim confirmed
- No checked-in file provisions a background worker pool, cross-session queue, or automatic retry daemon. All coordination is explicit, file-backed, and opt-in (consistent with AGENTS.md boundaries).
- Parallel execution remains host-product-only (`cursor-agent` CLI via `skills/parallel-batch/SKILL.md` or manual Composer tabs).

### Next for team
Lead has performed an initial consolidated research pass covering the scope of all 12 tasks. Worker tabs (if run) can now focus on deeper line-by-line review or security severity rating. Findings above are merged into this persistent audit note as evidence for AC-003.

This research pass was performed while actively using the oh-my-cursor plugin's own workflow-state contract and phase-controller discipline.
