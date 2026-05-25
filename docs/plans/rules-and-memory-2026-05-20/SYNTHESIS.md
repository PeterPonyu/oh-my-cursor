# Synthesis: Rules and memory layer for oh-my-cursor

**Date:** 2026-05-20  
**Status:** complete (AC-RM-01 through AC-RM-15)

## What we audited

Sibling plugins were read-only audited and distilled in
[`AUDIT.md`](./AUDIT.md):

| Source | Rules pattern | Memory pattern | Migrated? |
|--------|---------------|----------------|-----------|
| oh-my-claudecode | `rules-injector` hook, `omc-setup` CLAUDE.md markers | Three-tier notepad, project-memory JSON, wiki, `<remember>` tags | Partial — skills + templates, no tag-parsing hooks |
| Sibling CLI plugin | `AGENTS.md` markers, `developer_instructions` | Local notepad, repo-root wiki, project-memory | Partial — same notepad/wiki shape, OMCS markers |
| oh-my-openagent | Proximity rule walk, hierarchical AGENTS.md | Plan notepads, compaction prompt, boulder state | Partial — decisions ADRs + compaction philosophy only |

Full non-migration list: [`AUDIT.md` §5–6](./AUDIT.md).

## What we built

### Rules (plugin-shipped)

- `rules/memory-and-notepad.mdc` — when to use each memory surface
- `rules/rules-authoring.mdc` — how to add rules with install parity
- Cross-reference in `rules/repo-owned-plugin-boundary.mdc`

### Rules (workspace dev)

- `.cursor/rules/40-memory-layer.mdc` — dogfooding checklist for this repo

### Skills

| Skill | Role |
|-------|------|
| `remember` | Router: workflow-state vs notepad vs project memory vs decisions vs wiki |
| `notepad` | Priority / Working / MANUAL lifecycle |
| `wiki` | Markdown wiki + append-only log |
| `decisions` | ADR files under `docs/decisions/` |
| `rules-authoring` | New rule checklist + `local-plugin-check` |

### Templates and docs

- `docs/templates/*` (six files)
- `docs/memory-layer.md` (cross-cutting contract)

### Validators and tests

| Validator | Test module |
|-----------|-------------|
| `validate-notepad-format.py` | `test_validate_notepad_format.py` |
| `validate-project-memory.py` | `test_validate_project_memory.py` |
| `validate-wiki-structure.py` | `test_validate_wiki_structure.py` |
| `validate-decisions-format.py` | `test_validate_decisions_format.py` |
| `validate-memory-templates.py` | `test_validate_memory_templates.py` |
| `validate-rules-install-parity.sh` | `test_rules_install_parity.py` |
| — | `test_skills_governance.py` |

### MCP bridge (opt-in)

`mcp/cursor-state-bridge/memory_io.py` adds five tools with workspace
allowlist containment (not widening workflow-state jail roots):

- `memory_notepad_read`
- `memory_notepad_append_working`
- `memory_project_memory_read`
- `memory_project_memory_set_directive`
- `memory_wiki_log_append`

Tests: `mcp/cursor-state-bridge/tests/test_memory_io.py`.

### Wiring

- `AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/confirmed-surfaces.md`
- `scripts/install-local-plugin.sh` ships `docs/memory-layer.md` + templates
- `scripts/validate-plugin-structure.sh` requires new artifacts
- `scripts/validate-cursor-workflow-artifacts.py` — 19 skills, memory MCP policy
- `hooks/prompt-router.py` — memory skill keywords
- `skills/phase-controller`, `skills/auto-execute`, `skills/doctor` — memory hooks in workflow

## Design constraints we kept

1. **Hooks never write memory** — read-only observers only (matches
   `.cursor/rules/30-error-handling.mdc`).
2. **No auto-injection daemon** — agents invoke `remember` / owner skills
   explicitly; compaction reminder may cite notepad but does not mutate it.
3. **No `~/.omcs/` user config for memory** — consumer files live at
   workspace root or `docs/` paths documented in `docs/memory-layer.md`.
4. **Memory ≠ workflow-state ≠ PRD** — comparison table in
   `docs/memory-layer.md`.

## How to verify

```bash
# Memory layer (required)
python3 -m pytest tests/memory -q
for v in validate-notepad-format validate-project-memory validate-wiki-structure validate-decisions-format validate-memory-templates; do
  python3 scripts/$v.py --self-test
done
bash scripts/validate-rules-install-parity.sh

# Plugin + workflow (required)
bash scripts/validate-plugin-structure.sh
python3 scripts/validate-cursor-workflow-artifacts.py

# MCP (when --with-mcp is in scope)
python3 scripts/validate-mcp-server-structure.py
python3 -m pytest mcp/cursor-state-bridge/tests/test_memory_io.py -q

# Install parity
./scripts/install-local-plugin.sh --status
```

## Acceptance criteria status

| ID | Status |
|----|--------|
| AC-RM-01 … AC-RM-14 | passed (validators + pytest + wiring) |
| AC-RM-15 (MCP memory tools) | passed (`memory_io.py` + bridge tests) |
