# Unified Guidance Schema (AGENTS + Skills)

Status: Canonical contract for instruction-surface alignment across oh-my-cursor.

## Purpose

Define one shared schema that can be applied across:
- `agents/*.md` — agent prompt files
- `skills/*/SKILL.md` — skill workflow definitions
- Future team worker surfaces
- Runtime AGENTS overlays

This standard is additive and migration-safe: it does not change workflow-state APIs, marker contracts, or file-path ownership contracts.

## Canonical Schema Sections

### Required sections

1. **Role & Intent**
   - Who the agent/skill is and what success means.
   - For agents: what phase(s) they own.
   - For skills: when to invoke vs. when to skip.

2. **Operating Principles**
   - High-level decision rules (quality, speed, safety, verification).
   - Claim/proof discipline alignment.
   - Delegation and trust boundaries.

3. **Execution Protocol**
   - Ordered workflow steps for task execution.
   - Input expectations and output contracts.
   - State interaction rules (read vs. write paths).

4. **Constraints & Safety**
   - Boundaries, prohibited actions, and tool allowlists.
   - Phase-locked guards and state-invasion protections.
   - Ownership class enforcement (repo-owned vs. host-product-only).

5. **Verification & Completion**
   - Evidence required before completion claims.
   - Acceptance criteria mapping.
   - Verification partner references (who validates this agent's output).

6. **Recovery & Lifecycle**
   - Cancel/cleanup/resume behavior and state transitions.
   - Failure handling and escalation paths.
   - Retry limits and circuit breakers.

### Optional sections

- Tool catalogs and tool allowlist justifications.
- Skill discovery/reference sections (complementary skills).
- Hook alignment maps (which hooks fire during this agent's lifecycle).
- Session/runtime context blocks (when injected by runtime overlays).

## Agent Compliance

Every `agents/*.md` file should contain sections that map to these 6 required areas:

| Schema Section | Agent Equivalent | Example |
|---|---|---|
| Role & Intent | `# Agent Name` + description | "You are the **verifier** for this repository." |
| Operating Principles | `## Rules` or `## Responsibilities` | "Verify every changed file against acceptance criteria." |
| Execution Protocol | `## Input` + `## Output` | "Return a concise verification report:" |
| Constraints & Safety | `## Boundaries` | "Read-only. Do not use Write, Edit, or Bash." |
| Verification & Completion | `## Output` (evidence + criteria mapping) | "Mark criterion passed only with checked-in artifact path." |
| Recovery & Lifecycle | `## Hook & policy alignment` | "Respect the `stop-gate` hook at session end." |

## Skill Compliance

Every `skills/*/SKILL.md` file should contain sections that map to:

| Schema Section | Skill Equivalent |
|---|---|
| Role & Intent | `# Skill Name` + description frontmatter |
| Operating Principles | `## Use when` + `## Skip when` |
| Execution Protocol | `## Workflow` or numbered steps |
| Constraints & Safety | `## Boundaries` or explicit guardrails |
| Verification & Completion | `## Output` or acceptance criteria |
| Recovery & Lifecycle | Failure handling + handoff references |

## Global Compatibility Contracts

### Marker contracts

Reserved comment markers for runtime injection — do not remove:

- `<!-- OMC:HOST:START --> ... <!-- OMC:HOST:END -->` — OMC host injection
- `<!-- OMC:CURSOR:START --> ... <!-- OMC:CURSOR:END -->` — Cursor runtime injection

### File path conventions

- Workflow state: `.cursor/state/workflow-state.json` or `docs/plans/<task-id>/workflow-state.json`
- Acceptance criteria IDs: stable `AC-NNN` format, never renumbered
- Agent paths: `agents/<name>.md`
- Skill paths: `skills/<name>/SKILL.md`

### State ownership

- Agent-callable writes: cursor-state-bridge MCP tools only
- Developer CLI writes: `.cursor/state/workflow-state.py`
- Hook reads: hooks read workflow-state through environment variables or file paths
- Direct edits to `workflow-state.json`: prohibited from agents and skills
