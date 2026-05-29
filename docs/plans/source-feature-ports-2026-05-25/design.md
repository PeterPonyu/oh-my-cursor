# Source-feature ports — 2026-05-25

## Purpose

Port three small, recent features from upstream sibling repos
(`oh-my-claudecode`, `oh-my-codex`, and the upstream OMC project) into `oh-my-cursor`
as three independent, surgical TypeScript PRs. Each PR:

- touches one existing surface (no new files),
- stays under ~50 LOC,
- ships docs and runtime in the same diff,
- passes the validators named in `docs/PR-POLICY.md` before merge.

This batch is deliberately *small*. It mirrors the merged-PR cadence
observed in the source repos when they contribute externally
(typically <100 LOC, single concern, often one file family).

## Non-goals

- No new skills, no new agents, no new hooks, no new dependencies.
- No refactor of `tool-guard.ts`, `subagent-bootstrap.ts`,
  `subagent-summary.ts`, or `skills/doctor/SKILL.md` beyond the
  additions named below.
- No port of upstream features that require capabilities cursor does
  not have (no HUD, no LSP catalog, no tmux orchestration, no MCP
  bundle changes).
- No change to `hooks/hooks.json` — the hook registration set stays
  fixed.

## Source mapping

| PR | Source feature | Source file(s) | Cursor target |
|----|----------------|----------------|---------------|
| 1  | Naming-slop pre-tool check | `oh-my-claudecode` `src/scripts/pre-tool-enforcer.mjs` (merged #3013, 2026-05-15) | `hooks/tool-guard.ts` |
| 2  | Doctor bidirectional cross-ref | upstream OMC project `src/cli/doctor.ts` (schema-validator pattern) | `skills/doctor/SKILL.md` §6 |
| 3  | Subagent stall warning | upstream OMC project worktree `4218-stall-timeout-separation` | `hooks/subagent-bootstrap.ts` + `hooks/subagent-summary.ts` |

Each PR cites its source by file path and (where available) merged PR
number, so a reviewer can audit the port for fidelity.

---

## PR 1 — Naming-slop guard inside `tool-guard.ts`

### What changes

Add one `else if` branch to `tool-guard.ts` `main()`, after the existing
workflow-state and readonly-role checks. When the active tool is one of
`Write | Edit | MultiEdit | NotebookEdit` and the target file's basename
matches a naming anti-pattern, set `permission = 'ask'` and `status =
'ask'` with a user message that recommends overwriting the canonical
name instead of creating a slop variant.

Anti-patterns matched (as a top-of-file `const` for easy update):

- `*-final.{ext}`
- `*-final-v[0-9]+.{ext}`
- `*_backup.*`, `*_old.*`, `*_copy.*`
- `*_v[0-9]+.*` where N ≥ 2
- `* (1).*`, `* copy.*` (literal space + suffix)

The trace event gains one field: `naming_slop: <matched-pattern> | ''`.

### Why these patterns

These are the names humans create when they hesitate to overwrite the
canonical file. The upstream guard flags exactly this set. The check
emits `ask`, not `deny` — the user can always confirm if the slop name
was intentional (a one-off backup, a migration step, etc.).

### Ordering rationale

The new branch fires *after* the existing workflow-state and
readonly-role checks so those keep precedence. It fires *only* in the
otherwise-clean path; a workflow-state edit that also happens to match
a naming-slop pattern is still reported as a workflow-state issue,
because that's the bigger concern.

### Surfaces NOT changed

- `hooks/hooks.json` — no new hook entry.
- `hooks/_tool_payload.ts`, `hooks/_active_role.ts`, `hooks/_trace.ts`
  — no new exported helpers.
- No new test fixtures beyond the one that exercises the new branch.

### LOC estimate

~35 LOC (top-of-file `const` array of ~10 regexes + one `else if`
block + one trace field + one inline test case).

---

## PR 2 — Doctor manifest-completeness + skill-reference checks (`skills/doctor/SKILL.md`)

### Reality check

Cursor's `.cursor-plugin/plugin.json` does **not** declare a `skills:`
array — skills are discovered by scanning `skills/<name>/SKILL.md` at
runtime (already covered in §5 of the doctor skill). The manifest only
declares `name`, `displayName`, `description`, `version`, `author`,
`license`, `homepage`, `repository`, `keywords`, and (optionally)
`mcpServers` pointing to `mcp.json`. So a bidirectional plugin↔skill
cross-ref has nothing to cross-ref against.

Also: there is no `agents/ROLE-INDEX.md` in cursor (that pattern lives
in `oh-my-grokbuild`). An agents-catalogue cross-ref has no anchor
file to read.

The upstream "config completeness" pattern still ports usefully, but
to different anchors than the first draft assumed.

### What changes

Append two new sub-sections to `skills/doctor/SKILL.md` §6 ("Plugin
manifest"):

- **§6a. Manifest completeness.** Confirm `plugin.json` has non-empty
  `name`, `displayName`, `description`, and `version`. If
  `plugin.json.mcpServers` is set (string path), confirm that
  *either* `.cursor/mcp.json` *or* `.cursor/mcp.example.json` exists
  on disk (the live `.cursor/mcp.json` is gitignored per
  PR-POLICY §3, so the example file is the auditable artifact).
- **§6b. Skill-reference cross-ref.** For each
  `skills/<x>/SKILL.md`, parse its `Invoked by:` and `Invokes:` lines
  in the Orchestration Role block. Confirm every referenced skill
  name resolves to a `skills/<name>/SKILL.md` file on disk. `WARN`
  (not `FAIL`) on missing references — these are advisory
  documentation, not load-bearing wiring.

The report-format table at the bottom of the skill gains two rows:

```
| Manifest completeness       | OK / WARN  | which fields empty / missing mcp.json/example |
| Skill-reference cross-ref   | OK / WARN  | broken references with file:line              |
```

### Why append-as-subsection (not inline refactor)

Inline refactor churns §6 (~40 LOC). Append-as-subsection is
~25 LOC additive only — the existing §6 checks stay verbatim, easier
to review and to roll back.

### Surfaces NOT changed

- No new validator script. The skill stays read-only; no auto-fix.
- `scripts/validate-plugin-structure.sh` is not modified.
- The doctor skill's Boundaries section is unchanged.
- §5 (Skill catalogue) is untouched — that already verifies each
  directory has a `SKILL.md` whose `name:` matches the directory.

### LOC estimate

~25 LOC of new bullets + bash snippets + two table rows in
`skills/doctor/SKILL.md`. Zero new files.

---

## PR 3 — Subagent stall warning

### What changes

Two existing files gain a small pairing — start records a timestamp,
stop reads it and emits a warning if the gap exceeds a threshold.

#### `hooks/subagent-bootstrap.ts`

- On subagent start, write `{ role, start_ts, subagent_id? }` to a
  small JSON file at `.cursor/state/subagent-runs.json`. The file is
  an array, capped at the last 20 entries (drop oldest on push).
- The hook keeps its current behavior; the persisted record is
  additive and best-effort (any write error is swallowed so the hook
  stays fail-open).
- Trace event gains one field: `subagent_start_ts: <number>`.

#### `hooks/subagent-summary.ts`

- On subagent stop, read `.cursor/state/subagent-runs.json`, find the
  matching entry by `subagent_id` (or by `role` as a fallback), and
  compute `duration_ms = Date.now() - start_ts`.
- Emit `status: 'pass'` if `duration_ms <= STALL_THRESHOLD_MS`.
- Emit `status: 'warn'` with a `user_message` describing the role and
  elapsed seconds otherwise.
- If no matching entry exists (state file missing, JSON parse error,
  or no row matches `subagent_id`/`role`), emit `status: 'pass'`
  with `user_message: 'No matching start record; stall check skipped.'`
  — the hook stays fail-open, mirroring the existing tool-guard
  pattern.
- Default `STALL_THRESHOLD_MS = 600_000` (10 minutes). Overridable
  via `OMCURSOR_SUBAGENT_STALL_MS` env var.
- Remove the matched entry from the JSON file after reading (no
  removal on no-match).

#### State file

`.cursor/state/subagent-runs.json` is added to `.gitignore`. The
parent `.cursor/state/` directory already exists per cursor's
state-bridge convention; no new directory is created.

### Why a separate JSON file, not the trace stream

Trace is append-only event log; pairing a start event to a stop event
requires a scan with no native primary key. A small JSON array with a
20-entry cap is dead simple to read on stop, costs ~200 bytes per
entry at most, and self-cleans.

### Why per-subagent (not per-session) thresholds

This is the "separation" the source pattern is named for. The main
session might legitimately stay open for hours of user think-time; a
subagent that runs >10 minutes is almost always wedged. Mixing the
two signals creates noise that the user learns to ignore.

### Surfaces NOT changed

- `hooks/hooks.json` — no new entry; both hooks already register.
- No new shared helper; the JSON read/write is small enough to inline
  in each hook.
- `_trace.ts` gets one optional new field on existing events, no new
  trace-event types.

### LOC estimate

~40 LOC across two files (~22 in `subagent-bootstrap.ts`, ~18 in
`subagent-summary.ts`), plus one line in `.gitignore`.

---

## Per-PR validation checklist (from `docs/PR-POLICY.md`)

Every PR in this batch must, before opening:

1. Run `node --experimental-strip-types scripts/verify-backbone.ts`.
2. Run `node --experimental-strip-types scripts/test-plugin-on-cursor-cli.ts --run-prompt`.
3. Stay under ~50 LOC where stated; if a PR drifts past 70 LOC during
   implementation, split it before opening.
4. Cite the source upstream feature in the PR body (file path + PR
   number when available) so the port can be audited for fidelity.
5. Do **not** modify `.cursor/mcp.json` (gitignored) or the built
   `dist/` payload.

## Out of scope for this batch (deferred or rejected)

| Considered | Why deferred / rejected |
|------------|-------------------------|
| HUD model metadata (claudecode) | Cursor has no HUD surface. |
| Vue LSP discovery (claudecode) | Cursor uses the host IDE's LSP. |
| OSC 52 clipboard preservation (claudecode) | Cursor does not orchestrate tmux. |
| Goal artifact mapper (claudecode) | 180 LOC; exceeds per-PR cap. Revisit as its own design. |
| Co-author opt-out flag (codex) | No commit/git-master skill on disk in cursor. |
| Disabled provider filter (upstream) | Cursor's tool-guard already implements `agentToolsAllowlist`. |
| Live-tail integration (upstream) | 400+ LOC; not surgical. Revisit later. |
| Sparkshell secret redaction (codex) | Cursor has no sparkshell-equivalent surface. |

## Implementation order

PR 1 → PR 2 → PR 3, but the three are genuinely independent and can
land in any order. PR 1 first only because it touches the
most-frequently-edited file (`tool-guard.ts`), so it minimizes rebase
risk for the other two.

## Success criteria

- Three PRs opened against `oh-my-cursor`, each <70 LOC.
- All three pass `verify-backbone.ts` and
  `test-plugin-on-cursor-cli.ts --run-prompt` locally.
- Each PR body cites the upstream source it ports from.
- No new files, no new dependencies, no changes to
  `hooks/hooks.json`.
