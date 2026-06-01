---
name: remember
description: "[OMCS] Routing skill that decides where a new finding lives — workflow-state, notepad, project memory, decisions, wiki, or durable docs — without auto-writing through hooks."
---

# Remember

This skill turns the implicit "should I remember this?" question into an
explicit, file-backed decision. It is the router for the oh-my-cursor
memory layer.

The skill is **agent-invoked, not hook-triggered**. The plugin's hooks
(`claim-guard.ts`, `stop-gate.ts`, etc.) never write memory; they may
remind the user that this skill exists. All routing happens here.

## When to use

- A finding from the current chat is worth keeping across compaction or
  beyond this task.
- The user said "remember this", "save this", "note that", "add to memory",
  or similar.
- A reviewer agent (`critic`, `code-reviewer`) raised a comment that has
  durable value (a convention, a constraint, a sharp edge).
- An architectural choice was made (`decisions`).
- A codebase fact was discovered that future agents will need (`wiki`).

## Skip when

- The finding is workflow-state material (a phase change, an acceptance
  criterion passing). Use the `cursor-state-bridge` MCP tools instead.
- The finding is ephemeral chat noise.
- The finding is already documented in `README.md` or `docs/`.

## Routing decision tree

Answer these questions in order. Stop at the first `yes`.

1. **Is this an acceptance criterion or task-life status?**
   - Route to **workflow-state** via `state_update_acceptance_criterion`,
     `state_record_failure`, or `state_history_append`.

2. **Is this a permanent invariant the user wants every agent to respect?**
   - Route to **notepad / MANUAL**. Add a single line; never delete prior
     lines without asking. Use `skills/notepad/SKILL.md` step "append to
     MANUAL".

3. **Is this the most important context for the rest of this chat?**
   - Route to **notepad / Priority Context**. Replace the prior block.
     Keep it under 500 characters.

4. **Is this useful for this and the next few chats, but not forever?**
   - Route to **notepad / Working Memory**. Append one timestamped line.

5. **Is this a structured project fact (tech stack, build command,
   convention, hot path, user directive)?**
   - Route to **project memory** (`./project-memory.json`). Edit the
     matching key. Never overwrite `userOwned.customNotes` or
     `userOwned.directives`; append to them instead. Run
     `node --experimental-strip-types scripts/validate-project-memory.ts ./project-memory.json`
     after the edit.

6. **Is this an architectural or process decision with rationale?**
   - Route to **decisions**. Run `skills/decisions/SKILL.md` step "new
     decision".

7. **Is this a piece of codebase knowledge other agents will need to look
   up by topic?**
   - Route to **wiki**. Run `skills/wiki/SKILL.md` step "add page".

8. **None of the above, but the finding still has durable value?**
   - Route to **durable docs**: update the most relevant file under
     `docs/` or `README.md`. Use a regular code change, not the memory
     layer.

9. **Still no fit?**
   - Drop it. Most chat findings should be dropped.

## Anti-patterns

- Writing the same finding to two surfaces "to be safe". Pick one and
  add a pointer from any others.
- Dumping a long quote into notepad / Priority Context. The 500-char cap
  exists for a reason; summarize.
- Marking an entry as MANUAL without explicit user confirmation.
- Adding to `userOwned.directives` without the user saying "always" /
  "never" / "from now on".
- Triggering this skill from a hook. Hooks must stay read-only.

## Anti-amnesia checklist

Before stopping the chat, ask yourself:

- Did the user issue a "from now on" directive that isn't in
  `notepad.md` MANUAL or `project-memory.json`'s `directives`?
- Did the chat surface a sharp edge that future debugging would benefit
  from a wiki page on?
- Did we make an architectural choice that's not in `docs/decisions/`?

If yes to any, invoke this skill before closing.

## Governance

### Ownership Class

- **repo-owned**: YES — Checked in at `skills/remember/SKILL.md` as the
  router for the file-backed memory layer.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class

- **official-doc**: NO — Cursor does not document a generic "remember"
  primitive; this is repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/remember/SKILL.md`,
  `skills/notepad/SKILL.md`, `skills/wiki/SKILL.md`,
  `skills/decisions/SKILL.md`, `docs/templates/*`,
  `docs/memory-layer.md`, validators under `scripts/validate-*`.
- **runtime-smoke**: YES (optional) — When the `cursor-state-bridge`
  bridge is installed with the memory tools, an MCP invocation provides
  runtime proof.

### Claim Summary

`remember` is a routing skill that maps a finding to exactly one
memory surface (workflow-state, notepad, project memory, decisions,
wiki, or durable docs). It is agent-invoked and never triggered by
hooks. The routing decision tree is the contract; the surfaces have
their own owner skills.

## MCP Integration Points

| Tool/Resource | MCP Server | Purpose | Required |
|---|---|---|---|
| `memory_notepad_append_working` | cursor-state-bridge (with-mcp) | Append a Working Memory line | No |
| `memory_project_memory_set_directive` | cursor-state-bridge (with-mcp) | Idempotent directive add | No |
| `memory_wiki_log_append` | cursor-state-bridge (with-mcp) | Append a wiki log entry | No |
| `state_history_append` | cursor-state-bridge | Append a workflow-state history note | No |

Bridge is opt-in via `node --experimental-strip-types scripts/install-local-plugin.ts --with-mcp`.
Without the bridge, the agent edits files directly with normal file tools.

## Hooks Dependencies

None. This skill never reads or writes from a hook. `compact-reminder.ts`
may mention this skill in its reminder message, but the actual routing is
always an explicit agent invocation.

## Orchestration Role

- **Lifecycle phase(s)**: any (most useful at the end of `verify`, `review`, or `done`)
- **Invoked by**: User, `phase-controller`, `auto-execute` (Phase 4 review), `critic`/`code-reviewer` follow-up
- **Invokes**: `notepad`, `wiki`, `decisions` (and optionally MCP bridge state tools)
- **State contract**: Routes to one of the four memory surfaces; never writes workflow-state on its own
- **Failure handling**: If the user explicitly approved a routing and the surface validator fails, surface the validator output and stop; do not silently fall through to a different surface
