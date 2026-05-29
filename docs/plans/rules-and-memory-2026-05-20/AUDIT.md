# Rules & Memory audit — sibling plugins

**Date:** 2026-05-20
**Scope:** Read-only audit of how sibling agent plugins ship rules and
memory subsystems, with a paired audit of
what `oh-my-cursor` currently has and where the gaps are. Each finding cites
a path; nothing in this file is inferred.

The full subagent reports are preserved in this commit's history; this file
captures the distilled patterns and the migration verdict per pattern.

## 1. oh-my-claudecode (cached at `~/.claude/plugins/cache/omc/oh-my-claudecode/4.13.7/`)

### Rule surfaces

- Lean session doc: `docs/CLAUDE.md` is installed into a user's `CLAUDE.md`
  inside `<!-- OMC:START -->` / `<!-- OMC:VERSION:... -->` markers via
  `scripts/setup-claude-md.sh` (called by `skills/omc-setup/SKILL.md`).
- Project rule discovery: `src/hooks/rules-injector/finder.ts` walks
  `.claude/rules`, `.cursor/rules`, `.github/instructions`,
  `.github/copilot-instructions.md`, and `$CLAUDE_CONFIG_DIR/rules/`,
  parses frontmatter, matches globs, and appends rule bodies on tool
  invocation. Dedup state lives in `~/.omc/rules-injector/`.
- On-demand reference: `skills/omc-reference/SKILL.md` is loaded only when
  delegating or using OMC tools (`user-invocable: false` in frontmatter) to
  avoid bloating every prompt.

### Memory surfaces

- Notepad: `{worktree}/.omc/notepad.md` with three sections — Priority
  (replace, ≤500 chars), Working (timestamped, 7-day prune), MANUAL (never
  auto-pruned). MCP tools `notepad_*` in `src/tools/notepad-tools.ts`. Session
  start injects Priority via `formatNotepadContext()`.
- `<remember>` tags: agent output containing `<remember>...</remember>` or
  `<remember priority>` is parsed in `src/hooks/omc-orchestrator/index.ts`
  and routed to notepad sections.
- Project memory: `.omc/project-memory.json` with JSON merge semantics —
  `customNotes`, `userDirectives`, `hotPaths` preserved across rescans
  (`src/hooks/project-memory/storage.ts`). SessionStart re-injection;
  PreCompact recovery.
- Plan-scoped wisdom: `.omc/notepads/{plan}/learnings.md`, `decisions.md`,
  `issues.md`, `problems.md` — append-only per plan
  (`src/features/notepad-wisdom/index.ts`).
- Wiki: `.omc/wiki/*.md`, `index.md`, `log.md` (append-only). No embeddings,
  keyword/tag query only (`skills/wiki/SKILL.md`).
- Shared memory: `.omc/state/shared-memory/{namespace}/{key}.json`.
- Learned skills: `.omc/skills/*.md` with YAML frontmatter, trigger globs,
  caps of 10 skills/session and 3000 chars (`src/hooks/learner/`,
  `skills/skillify/SKILL.md`).
- Writer memory: `.writer-memory/memory.json` for creative writing
  (`skills/writer-memory/SKILL.md`).

### Skills directly responsible

`omc-reference`, `remember`, `wiki`, `learner`/`skillify`, `writer-memory`,
`deepinit`, `project-session-manager`, `configure-notifications`, `omc-setup`.

## 2. Sibling CLI plugin (`~/.codex/` + global npm package)

### Rule surfaces

- `templates/AGENTS.md` installed into a project's `AGENTS.md` via marker
  block. Authority order is `AGENTS.md` > prompts.
- `~/.codex/config.toml` `developer_instructions` block merged via
  `dist/config/generator.d.ts`.
- Hook-injected per-turn context via `src/scripts/codex-native-hook.ts`
  appends routing advisories and ends with "Follow AGENTS.md routing...".
- Skill scopes: `.codex/skills` > `~/.codex/skills` (project wins).

### Memory surfaces

- Notepad: workspace-local markdown notepad, same three-section shape as OMC.
  Atomic write `.tmp` + rename. Caps: 500 chars Priority on write, 220
  chars on session inject.
- Project memory: canonical `<repo>/project-memory.json` with legacy
  workspace-local fallback. MCP `project_memory_*`.
- Wiki: canonical repo-root markdown wiki, `index.md`, `log.md`; legacy
  hidden-directory read-only fallback. `wiki.autoCapture` true by default.
  Session-end auto-capture `session-log-YYYY-MM-DD-<id>.md`.
- Plans / drafts: workspace-local plans and drafts directories.
- Workflow state: workspace-local state directory (mode files, sessions,
  team state).

### Skills

`note` (deprecated → MCP-only), `wiki`, `plan`, `setup`, `skill`, `help`,
`doctor`.

## 3. Upstream OMC project (sibling repo)

### Rule surfaces (declarative)

- 48 hierarchical `AGENTS.md` files (root + `src/**/AGENTS.md`,
  `web/AGENTS.md`).
- `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`.
- `.claude/rules/**`, `.cursor/rules/**`, `.sisyphus/rules/**`, and other
  per-host rules directories (`src/hooks/rules-injector/constants.ts`).
- User-global `~/.claude/rules/**` (distance 9999).

### Runtime injection

- `rules-injector` hook on `tool.execute.after` for `read|write|edit|multiedit`:
  ESLint-like walk from file dir to project root, frontmatter `globs` / `paths` /
  `applyTo` / `alwaysApply`, dedup by realpath + content hash, session-scoped
  cache cleared on compaction.
- `directory-agents-injector` hook walks `AGENTS.md` files up the tree on
  read, skips project-root file (the host product loads it natively).
- `experimental.chat.messages.transform`: `ContextCollector` merges
  pending context blobs from hooks into the last user message.

### Memory surfaces

- `.sisyphus/boulder.json` (active plan, session lineage, task→session map).
- `.sisyphus/plans/{name}.md` (read-only Prometheus plans).
- `.sisyphus/notepads/{plan-name}/learnings.md, issues.md, decisions.md,
  problems.md` (append-only per plan).
- `.sisyphus/run-continuation/{sessionID}.json` (CLI resume markers).
- `ContextCollector` (in-memory per session, sorted/dedup merge).
- Compaction memory: structured prompt in
  `src/hooks/compaction-context-injector/compaction-context-prompt.ts`
  enumerating user requests, goals, work done, remaining tasks, constraints
  verbatim, and `session_id`s to resume not restart.
- Co-located tests: `src/index.compacting.test.ts`,
  `src/hooks/preemptive-compaction.test.ts`,
  `src/hooks/compaction-context-injector/*.test.ts`,
  `src/hooks/compaction-todo-preserver/*.test.ts`, more.

## 4. oh-my-cursor today

### Rules

- `rules/repo-owned-plugin-boundary.mdc` — one plugin rule, scoped.
- `.cursor/rules/00-repo-scope.mdc`, `10-docs-claims.mdc`,
  `20-commit-discipline.mdc`, `30-error-handling.mdc` — workspace dev rules.
- `scripts/install-local-plugin.sh` explicitly **excludes** `.cursor/rules/`
  from the install payload. `validate-plugin-structure.sh` requires
  `20-commit-discipline.mdc` and `30-error-handling.mdc` to exist in the
  repo, but the install never ships them.

### Memory

- `.cursor/state/workflow-state.json` (runtime, gitignored).
- `.cursor/state/workflow-state.schema.json` + `workflow-state.py` library +
  `validate-workflow-state.py` validator.
- Per-task archive `docs/plans/<task-id>/workflow-state.json`.
- `docs/PRD.yaml` (MCP bridge AC registry).
- `.cursor/state/active-role.json` (subagent active role).
- `.omcs/hook-trace.log`, `.omcs/cursor-state-bridge/trace.jsonl` (observability).
- `prd.json` is *documented* in skills but **no schema or validator exists**;
  `scripts/validate-prd.py` is referenced in skills but missing from disk.
- No notepad, no wiki, no project-memory, no decisions journal, no
  remember/learner skill.

### Tests / validators tooling

- pytest at `tests/hooks/`, unittest at `mcp/cursor-state-bridge/tests/`.
- 10 Python validators + ~5 bash smokes under `scripts/`.
- Validator template pattern: stdlib only, `ROOT = Path(__file__).resolve().parents[1]`,
  `fail()` / `ok()` helpers, optional `--self-test` mode using
  `tempfile.TemporaryDirectory`.

## 5. Pattern migration verdict

| Pattern | Migrate? | Adapted form for oh-my-cursor |
|---------|----------|-------------------------------|
| Three-tier notepad (Priority/Working/MANUAL) | YES | `docs/templates/notepad.md`, `skills/notepad`, `scripts/validate-notepad-format.py` |
| `<remember>` tag parsing in hooks | NO | Conflicts with `.cursor/rules/30-error-handling.mdc` (hooks must not write workflow data). Replace with explicit `skills/remember/SKILL.md` invocation |
| Project memory JSON with merge semantics | YES | `docs/templates/project-memory.json`, `skills/remember`, `scripts/validate-project-memory.py` |
| Marker-bounded merge | YES | Adopt `<!-- OMCS:MEMORY:START -->` for project-memory.json keys that users hand-edit |
| Markdown wiki with append-only `log.md` | YES | `docs/templates/wiki-*.md`, `skills/wiki`, `scripts/validate-wiki-structure.py` |
| Plan-scoped notepad wisdom | PARTIAL | Folded into `skills/decisions` (ADR files under `docs/decisions/`) + `notepad` Working section |
| Auto-injection via SessionStart / PreCompact hooks | NO | Our hooks are read-only observers. Skills do the injection explicitly |
| `<remember priority>` priority routing | YES (as skill prompt only) | `skills/remember` decides the section; no tag parsing in hooks |
| On-demand reference skill (`omc-reference`) | NO | Cursor already loads `agents/` and `skills/` lazily |
| `~/.omc/rules-injector/` dedup cache | NO | Cursor product loads `.cursor/rules/` natively; we don't reimplement an injector |
| Proximity (ESLint-like) rule walk | NO | Cursor handles `.cursor/rules/` discovery natively |
| Compaction-resilience nudge | YES | Already present in `hooks/compact-reminder.py`; reinforce with explicit notepad reference in the reminder message (not part of this scope; documented as a follow-up) |
| Writer memory | NO | Out of scope for a Cursor-native generic plugin |
| Learner skill | NO | OMC's `learner` writes runtime skills to `~/.claude/`; we have no analogous writable plugin root. Documented as out of scope |
| Setup-owned surface map | YES | `docs/confirmed-surfaces.md` already serves this; add memory rows |
| Doctor validation of memory surfaces | YES | Extend `skills/doctor/SKILL.md` to mention memory validators (separate follow-up, documented as next step) |

## 6. Non-migration safeguards

When implementing, we will:

- Never write a hook that mutates memory or rules at runtime (matches
  `.cursor/rules/30-error-handling.mdc`).
- Never claim that Cursor "auto-injects" notepad content unless a
  product-level capability is documented.
- Never introduce `~/.omcs/`, `$OMCS_CONFIG_DIR`, or similar user-home
  config dirs.
- Never extend the writer CLI surface for agent-callable code; memory edits
  use file tools or the optional MCP bridge.
- Never copy sibling-plugin slash-command syntax
  — Cursor invokes skills via the Cursor composer.

## 7. Decision log (for the synthesis doc)

1. Memory files live in `docs/` (checked-in templates) and the consumer
   workspace root (`notepad.md`, `project-memory.json`) — not under
   `.cursor/`.
2. No new MCP server; optional memory tools land on the existing
   `cursor-state-bridge` server, gated by the same `--with-mcp` install
   flag.
3. The repository's own `notepad.md` / `project-memory.json` are templated,
   not live runtime files. Live runtime files in a consumer repo are
   gitignored by user choice; we document the recommendation but do not
   enforce it (consistent with workflow-state runtime files).
4. New rules go in `rules/` so they ship with the plugin install. Workspace
   dev rules under `.cursor/rules/` continue to be dev-only (gated by
   install-script exclude).
5. Validators only assert format. No validator infers semantics from notepad
   content (we don't claim to know what "priority" means in a user's repo).
