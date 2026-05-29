# Plan: Rules and Memory layer for oh-my-cursor

**Date:** 2026-05-20
**Author:** auto-execute Phase 1 (planner role)
**Status:** approved-by-construction (user invoked `/auto-execute` with explicit
"do not stop until done")

## 1. Problem statement

Prior commits in this repository concentrated on:

- `agents/*.md` role prompts,
- `skills/*/SKILL.md` orchestration skills,
- `hooks/hooks.json` lifecycle helpers, and
- the optional `mcp/cursor-state-bridge/` MCP server for workflow state.

The user has flagged that the plugin has no first-class **rules construction**
layer (beyond a single boundary rule) and no first-class **memory** layer
(no notepad, no project memory, no wiki, no decisions journal, no remember
router). Sibling projects in the local agent-plugin family all ship richer
rules + memory layers. This plan
documents what to migrate, how to fit it inside the oh-my-cursor claim/proof
regime, and how it gets verified.

## 2. Audit references

Per-project audits are summarised in `docs/plans/rules-and-memory-2026-05-20/AUDIT.md`.

Key findings driving this plan:

| Source | Pattern this plan borrows |
|--------|---------------------------|
| oh-my-claudecode `skills/remember/SKILL.md` | Routing skill that decides where new findings live |
| oh-my-claudecode notepad (`src/hooks/notepad/`) | Three-tier notepad: Priority / Working / MANUAL with char caps |
| oh-my-claudecode `skills/wiki/SKILL.md` | Append-only `log.md`, no embeddings, repo-tracked markdown wiki |
| oh-my-claudecode `src/hooks/project-memory/` | JSON project memory with merge semantics, user-protected keys |
| Sibling `AGENTS.md` markers | `<!-- OMCS:MEMORY:START -->` marker-bounded merge for user-owned docs |
| Sibling repo-root wiki pattern | Wiki as committed markdown at repo root, not hidden under `.omc/` |
| Upstream OMC project `src/hooks/rules-injector/` | Proximity-based rule walk + dedup by realpath + content hash (notes only — Cursor product loads `.cursor/rules/` natively) |
| Upstream OMC project `compaction-context-prompt.ts` | Structured compaction summary sections (already in our `compact-reminder.py` philosophy; reinforce with notepad) |

Things we explicitly do **not** migrate (full list in AUDIT.md):

- Claude-Code-only slash-command syntax (`/oh-my-claudecode:wiki`).
- Non-Cursor config roots from sibling plugins.
- Auto-injection runtime hooks: this repo enforces fail-open, read-only hooks
  (see `.cursor/rules/30-error-handling.mdc`); we will not introduce a
  daemon-like memory injector.
- Model-name routing assumptions (Sonnet/Opus/Haiku, gpt-5.x).
- `~/.omc/state/token-tracking.jsonl` analytics.

## 3. Design principles (constraints inherited from this repo)

1. **Markdown-first, file-backed, human-visible.** Same as workflow-state.
2. **No background daemons.** Hooks are read-only observers; memory writes
   are done by the agent through normal file tools or, optionally, through
   the MCP bridge.
3. **Claim/proof discipline.** Every new skill carries the standard
   Ownership Class + Proof Class + Claim Summary block.
4. **Python stdlib only** for new validators (no `pyyaml`, no `jsonschema`).
5. **No `.cursor/memories/` and no hidden config dir.** The repo install
   already forbids it (`scripts/install-local-plugin.sh` excludes it).
6. **Two scopes for rules**, same split as today:
   - `rules/` — plugin-shipped, ships with `install-local-plugin.sh`.
   - `.cursor/rules/` — dev workspace only; never installed (already gated
     in the install script).
7. **Memory artifacts live in `docs/`** (checked-in) or workspace-root
   (`notepad.md`, `project-memory.json`) gitignored by default at consumer
   workspaces; for this repo's own dogfooding they remain examples under
   `docs/templates/`.

## 4. Surfaces to add

### 4.1 Rules (plugin-shipped under `rules/`)

| File | Purpose | Globs | alwaysApply |
|------|---------|-------|-------------|
| `rules/memory-and-notepad.mdc` | When and how to use notepad / project memory / decisions / wiki; explicit ownership | `notepad.md`, `docs/notepad*/**`, `project-memory.json`, `docs/wiki/**`, `docs/decisions/**`, `docs/memory-layer.md` | `false` |
| `rules/rules-authoring.mdc` | How to write new rules in this plugin (frontmatter shape, install parity, claim/proof block) | `rules/**`, `.cursor/rules/**` | `false` |

`rules/repo-owned-plugin-boundary.mdc` already exists and stays unchanged
except for a one-line cross-reference to the new memory rule.

### 4.2 Rules (workspace dev under `.cursor/rules/`)

| File | Purpose | Globs | alwaysApply |
|------|---------|-------|-------------|
| `.cursor/rules/40-memory-layer.mdc` | Repo policy on memory artifacts in this codebase (where templates live, when to update them) | `docs/templates/**`, `docs/memory-layer.md`, `rules/memory-and-notepad.mdc`, `skills/{remember,notepad,wiki,decisions,rules-authoring}/**` | `true` |

### 4.3 Skills (`skills/`)

| Skill | Purpose | Invokes |
|-------|---------|---------|
| `skills/remember/SKILL.md` | Routing decision: workflow-state vs notepad-priority vs notepad-working vs notepad-MANUAL vs project-memory vs decisions vs wiki vs durable docs | `notepad`, `wiki`, `decisions` |
| `skills/notepad/SKILL.md` | Notepad lifecycle (read/append/promote/prune); three sections with caps | none |
| `skills/wiki/SKILL.md` | Markdown wiki lifecycle (add/update/list/search/log) | none |
| `skills/decisions/SKILL.md` | Architecture/decision-record lifecycle (create/list/supersede) | none |
| `skills/rules-authoring/SKILL.md` | How to add a new rule (where to put it, install-parity rule, validators to run) | `local-plugin-check` |

All five carry the standard governance block (Ownership Class / Proof Class /
Claim Summary), Hooks Dependencies, MCP Integration Points (`status: optional`
where the bridge is extended), Orchestration Role, anti-patterns, stop conditions.

### 4.4 Templates (`docs/templates/`)

| File | Purpose |
|------|---------|
| `docs/templates/notepad.md` | Three-section notepad with char caps documented inline |
| `docs/templates/project-memory.json` | Structured project memory with marker-protected `customNotes` / `userDirectives` |
| `docs/templates/decision.md` | ADR template (Status / Context / Decision / Consequences / Evidence) |
| `docs/templates/wiki-index.md` | Wiki index entry template (sections + `[[wiki-link]]` convention) |
| `docs/templates/wiki-page.md` | Wiki page template with YAML frontmatter |
| `docs/templates/wiki-log.md` | Wiki append-only log template |

### 4.5 Documentation

| File | Purpose |
|------|---------|
| `docs/memory-layer.md` | Cross-cuts the four memory surfaces; explains scope, lifecycle, who-writes-what, integration with workflow-state and PRD; references audit |
| `docs/plans/rules-and-memory-2026-05-20/PLAN.md` | This document |
| `docs/plans/rules-and-memory-2026-05-20/AUDIT.md` | Cross-project audit summary (compressed reports) |
| `docs/plans/rules-and-memory-2026-05-20/SYNTHESIS.md` | What we built, why, how to verify |

### 4.6 Validators (`scripts/`)

| Script | Purpose | Mode |
|--------|---------|------|
| `scripts/validate-notepad-format.py` | Verify notepad markdown has the three required sections with caps respected | default + `--self-test` |
| `scripts/validate-project-memory.py` | JSON schema (stdlib) for project memory file: required keys, types, max sizes | default + `--self-test` |
| `scripts/validate-wiki-structure.py` | Verify wiki dir has `index.md`, `log.md`, no oversized pages | default + `--self-test` |
| `scripts/validate-decisions-format.py` | Verify ADR files have required frontmatter and Status enum | default + `--self-test` |
| `scripts/validate-memory-templates.py` | Verify `docs/templates/*` are well-formed | default + `--self-test` |
| `scripts/validate-rules-install-parity.sh` | Assert plugin install payload contains every `rules/*.mdc` file the repo ships | default |

### 4.7 Tests (`tests/memory/`)

| Test | Coverage |
|------|----------|
| `tests/memory/__init__.py` | Marker |
| `tests/memory/conftest.py` | Path bootstrapping; mirrors `tests/hooks/conftest.py` |
| `tests/memory/test_validate_notepad_format.py` | pytest: happy + 4 negative cases |
| `tests/memory/test_validate_project_memory.py` | pytest: happy + 4 negative cases |
| `tests/memory/test_validate_wiki_structure.py` | pytest: happy + 3 negative cases |
| `tests/memory/test_validate_decisions_format.py` | pytest: happy + 3 negative cases |
| `tests/memory/test_validate_memory_templates.py` | pytest: every shipped template passes |
| `tests/memory/test_skills_governance.py` | pytest: each new SKILL.md has Ownership/Proof/Claim/MCP/Hooks blocks |
| `tests/memory/test_rules_install_parity.py` | pytest: shells out to install script in `--status` mode and asserts rule presence |

### 4.8 Wiring updates

| File | Change |
|------|--------|
| `AGENTS.md` | Add `## Memory layer` section; link `docs/memory-layer.md` |
| `README.md` | Add row to the surfaces table for memory templates; mention `docs/memory-layer.md` |
| `CHANGELOG.md` | Add entry under Unreleased: feat(memory): rules + memory layer |
| `skills/phase-controller/SKILL.md` | Cite `remember` skill in the `verify`/`review` step; cite `notepad` in `intake` |
| `skills/auto-execute/SKILL.md` | Reference `remember` as an optional Phase 4 step |
| `scripts/install-local-plugin.sh` | Include `docs/templates/`, `docs/memory-layer.md` in payload includes |
| `scripts/validate-plugin-structure.sh` | Add new rules + skills + templates + validators to `required` list and to the docs-mention checks |
| `docs/references.md` | Add citations for migrated patterns (with `accessed` dates) |
| `docs/confirmed-surfaces.md` | Add a row per new surface with ownership/proof |

### 4.9 Optional MCP bridge extension

Lightweight, opt-in extension to `mcp/cursor-state-bridge/`:

| Tool | Purpose | Status |
|------|---------|--------|
| `memory_notepad_read` | Read `notepad.md` (default `./notepad.md`) | optional |
| `memory_notepad_append_working` | Append a timestamped line to Working Memory | optional |
| `memory_project_memory_read` | Read `project-memory.json` | optional |
| `memory_project_memory_set_directive` | Add to `directives[]` (idempotent) | optional |
| `memory_wiki_log_append` | Append a line to `docs/wiki/log.md` | optional |

These are explicitly opt-in (`--with-mcp` install). The default plugin
install does not change. We add:

- New tool registrations in `mcp/cursor-state-bridge/server.py`.
- New jail-aware IO module `mcp/cursor-state-bridge/memory_io.py`.
- Tests under `mcp/cursor-state-bridge/tests/test_memory_io.py`.
- README updates under `mcp/cursor-state-bridge/README.md`.

If at any point this proves to balloon the change beyond a single
auto-execute pass, the MCP extension is the first thing we descope; the
rules + skills + templates + validators + tests must ship regardless.

## 5. Phases

```
Phase 2a — Rules + templates + docs scaffolding
Phase 2b — Skills (remember, notepad, wiki, decisions, rules-authoring)
Phase 2c — Validators + tests + wiring (install script, validate-plugin-structure, AGENTS.md, README.md, CHANGELOG.md, phase-controller, auto-execute)
Phase 2d — (Optional) MCP bridge memory tools + tests
Phase 3   — Run full QA: pytest, all validators, install --status, plugin-structure validator, smoke tests
Phase 4   — Self-review against critic/code-reviewer/security-reviewer skills' rubrics; write SYNTHESIS.md
```

## 6. Acceptance criteria (concrete, testable)

The implementation is complete when all of the following hold:

| ID | Criterion | Verification |
|----|-----------|--------------|
| AC-RM-01 | `rules/memory-and-notepad.mdc` exists with valid mdc frontmatter | grep frontmatter + listed in `validate-plugin-structure.sh` required list |
| AC-RM-02 | `rules/rules-authoring.mdc` exists with valid mdc frontmatter | same |
| AC-RM-03 | `.cursor/rules/40-memory-layer.mdc` exists, `alwaysApply: true` | grep + already-covered by `validate-agent-bridge-contract.py` |
| AC-RM-04 | Five new skills exist with full governance blocks | `tests/memory/test_skills_governance.py` PASS |
| AC-RM-05 | Six templates exist under `docs/templates/` | `tests/memory/test_validate_memory_templates.py` PASS |
| AC-RM-06 | `docs/memory-layer.md` exists and is referenced by `AGENTS.md`, `README.md`, plugin-structure validator | grep + validator updates |
| AC-RM-07 | Each new validator has `--self-test` mode that exits 0 cleanly | `bash -c 'for v in validate-notepad-format validate-project-memory validate-wiki-structure validate-decisions-format validate-memory-templates; do python3 scripts/$v.py --self-test; done'` |
| AC-RM-08 | `tests/memory/` pytest collection green | `python3 -m pytest tests/memory -q` |
| AC-RM-09 | `scripts/validate-plugin-structure.sh` PASS after additions | shell exit 0 |
| AC-RM-10 | `scripts/validate-rules-install-parity.sh` PASS | shell exit 0 |
| AC-RM-11 | `scripts/install-local-plugin.sh --status` (or dry copy to a tempdir) shows new templates and rules in payload | shell exit 0 |
| AC-RM-12 | `CHANGELOG.md`, `docs/references.md`, `docs/confirmed-surfaces.md` updated | grep |
| AC-RM-13 | No legacy short-name leakage in new files | `python3 scripts/validate-public-language.py` |
| AC-RM-14 | No writer-CLI bypass in new agent-callable surfaces | `python3 scripts/validate-agent-bridge-contract.py` |
| AC-RM-15 | (Optional) MCP memory tools: `python3 -m pytest mcp/cursor-state-bridge -q` green | pytest |

Stop the loop only when AC-RM-01..AC-RM-14 are all `passed`. AC-RM-15 is
optional but in-scope; descope only if it would push us over a hard cap.

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| New surfaces drift from `validate-plugin-structure.sh` required list | Add them in the same commit; AC-RM-09 catches drift |
| Install script forgets to copy new files | Add explicit `--include` lines for `docs/templates/` and `docs/memory-layer.md`; AC-RM-11 catches drift |
| Agents try to invoke a non-existent `memory.py` CLI | We do not ship one. All examples use file tools or MCP. `validate-agent-bridge-contract.py` already forbids unknown CLI invocations |
| Memory layer claims hidden auto-injection | Every skill explicitly documents "no daemon, agent calls explicitly"; `30-error-handling.mdc` covers fail-open hook behavior |
| Confusion with workflow-state | `docs/memory-layer.md` has an explicit "memory vs workflow-state vs PRD" comparison table |

## 8. Out-of-scope (explicit)

- Embeddings / vector wiki.
- Auto-injection hooks beyond the existing fail-open observers.
- Cursor host integration with `manage_personal_rules` (host-only, not
  repo-owned).
- Renaming or moving existing skills.
- Modifying agents/*.md (the agents already use workflow-state; memory is
  an additive capability invoked through skills).
