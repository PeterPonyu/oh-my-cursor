# Memory layer

The oh-my-cursor plugin ships an explicit, file-backed memory layer with
four surfaces. None of them are written by hooks; none of them are part of
workflow-state. They are designed for Cursor's read-only-hook environment
and for the repo's claim/proof regime.

This document is the single cross-cutting reference. The per-surface
contract lives in the matching SKILL.md.

## Surfaces at a glance

| Surface | Default consumer path | Owner skill | Template | Validator | Lifetime |
|---------|------------------------|-------------|----------|-----------|----------|
| Notepad | `./notepad.md` | `skills/notepad/SKILL.md` | `docs/templates/notepad.md` | `scripts/validate-notepad-format.py` | per workspace |
| Project memory | `./project-memory.json` | `skills/remember/SKILL.md` (router) | `docs/templates/project-memory.json` | `scripts/validate-project-memory.py` | per workspace |
| Decisions | `./docs/decisions/YYYYMMDD-<slug>.md` | `skills/decisions/SKILL.md` | `docs/templates/decision.md` | `scripts/validate-decisions-format.py` | per workspace, append-only |
| Wiki | `./docs/wiki/` (`index.md`, `log.md`, pages) | `skills/wiki/SKILL.md` | `docs/templates/wiki-index.md`, `wiki-page.md`, `wiki-log.md` | `scripts/validate-wiki-structure.py` | per workspace, append-only log |

## Memory vs workflow-state vs PRD

| Question | Use this |
|----------|----------|
| What phase is this task in? Which acceptance criteria are passing? | **workflow-state** (`.cursor/state/workflow-state.json`) |
| What stories are still open in this run? | **PRD** (`./prd.json`) when running `iterate-loop` or `auto-execute` |
| What should the agent remember for the rest of *this* chat? | **notepad / Priority Context** |
| What should the agent remember across chats but only as a hint? | **notepad / Working Memory** |
| What is a permanent invariant the user wants every agent to respect? | **notepad / MANUAL** |
| What are the project's tech stack, conventions, hot paths? | **project memory** |
| Why did we choose Postgres over SQLite? | **decisions** (one ADR file) |
| How does our auth flow work? | **wiki** (one page) |

If the answer crosses surfaces, write a short pointer in the smaller
surface and put the body in the larger one (e.g. notepad MANUAL line
"Auth flow: see docs/wiki/auth-flow.md").

## Lifecycle rules

### Notepad

- `## Priority Context` — replace on write; max 500 chars between the
  `<!-- OMCS:NOTEPAD:PRIORITY -->` markers.
- `## Working Memory` — append timestamped lines; agents may prune lines
  older than 7 days. Each line is `YYYY-MM-DDTHH:MM:SSZ note`.
- `## MANUAL` — never auto-prune. Agents read, but only humans add or
  remove lines. The owning skill (`notepad`) refuses to delete lines from
  this section.

### Project memory

- The schema is documented in `scripts/validate-project-memory.py`. Stable
  keys: `version`, `task`, `techStack`, `build`, `conventions`,
  `structure`, `userOwned`, `hotPaths`.
- `userOwned.customNotes` and `userOwned.directives` are protected:
  automated rescans must not overwrite them. The validator fails if a
  rescan removes lines.

### Decisions

- One file per decision, `docs/decisions/YYYYMMDD-<slug>.md`.
- Frontmatter required: `id`, `title`, `status`, `date`, `supersedes`,
  `superseded_by`, `tags`.
- `status` enum: `proposed`, `accepted`, `rejected`, `deprecated`,
  `superseded`.
- A new decision that supersedes an older one sets the older one's
  `status` to `superseded` and fills `superseded_by`. Existing decisions
  are otherwise immutable.

### Wiki

- `docs/wiki/index.md` lists every page.
- `docs/wiki/log.md` is append-only; entries sorted by timestamp.
- Pages are `<slug>.md` with the YAML frontmatter shown in
  `docs/templates/wiki-page.md`. Max page size: 10 KiB.
- No embeddings, no vector store. Keyword/grep is the search mechanism.

## How the surfaces are read

| Reader | What it reads | When |
|--------|---------------|------|
| Agent (any role) | All four surfaces through normal file tools | When the matching skill is invoked |
| `skills/remember/SKILL.md` | All four — to decide where a new finding goes | On explicit invocation |
| `skills/phase-controller/SKILL.md` | Notepad Priority Context (recommended) on `intake`; decisions index on `plan` | Per phase routing |
| `hooks/compact-reminder.py` | Notepad MANUAL (read-only) — to remind the user that durables exist | On `preCompact` |
| MCP bridge (optional) | Notepad, project memory, wiki log (when `--with-mcp` is installed) | On explicit tool call |

Hooks **never** write. Validators are read-only by default. Agents write
through normal file tools or, optionally, through the bridge.

## How to extend

1. Add a row to the surfaces table above.
2. Add a template under `docs/templates/`.
3. Add a validator under `scripts/`.
4. Add tests under `tests/memory/`.
5. Add a SKILL.md under `skills/` (if a new owner skill is needed).
6. Update `rules/memory-and-notepad.mdc` to mention the new surface in
   its rule body.
7. Update `scripts/install-local-plugin.sh` to include the new template
   in the rsync payload.
8. Update `scripts/validate-plugin-structure.sh` to require the new
   template + validator.
9. Update `AGENTS.md`, `README.md`, `docs/confirmed-surfaces.md`, and
   `CHANGELOG.md` in the same change.

See `.cursor/rules/40-memory-layer.mdc` for the workspace dev checklist.

## Optional MCP bridge tools

When the bridge is installed via `./scripts/install-local-plugin.sh
--with-mcp`, the following memory tools are available:

| Tool | Purpose |
|------|---------|
| `memory_notepad_read` | Read `notepad.md` (default `./notepad.md`) |
| `memory_notepad_append_working` | Append a single timestamped line to Working Memory |
| `memory_project_memory_read` | Read `project-memory.json` |
| `memory_project_memory_set_directive` | Add an entry to `userOwned.directives` (idempotent) |
| `memory_wiki_log_append` | Append a single entry to `docs/wiki/log.md` |

All tools obey the same jail root as the workflow-state tools. They
operate on plain JSON / markdown and do not interact with workflow-state.

## References

- `rules/memory-and-notepad.mdc` — plugin-shipped rule.
- `.cursor/rules/40-memory-layer.mdc` — workspace dev rule.
- `docs/plans/rules-and-memory-2026-05-20/PLAN.md` — design plan.
- `docs/plans/rules-and-memory-2026-05-20/AUDIT.md` — sibling-project audit.
- `docs/references.md` — external citations for the migrated patterns.
