---
name: notepad
description: "[OMCS] Notepad lifecycle skill — three-section markdown (Priority / Working / MANUAL) with explicit char caps and pruning rules."
---

# Notepad

The notepad is a single markdown file at the workspace root (`./notepad.md`
by default, or `./docs/notepad.md` if the consumer prefers). It survives
chat compaction because it lives on disk.

It has three sections, each with a distinct lifecycle:

| Section | Lifecycle | Char cap | Owner |
|---------|-----------|----------|-------|
| `## Priority Context` | Replace on write | 500 chars between markers | Agent (replaceable) |
| `## Working Memory` | Append timestamped lines | Per-line; whole section may be pruned > 7 days | Agent (prunable) |
| `## MANUAL` | Append only; never auto-prune | None | User-owned (agents may read) |

The template lives at `docs/templates/notepad.md`. Format is enforced by
`scripts/validate-notepad-format.py`.

## When to use

- Invoked from `skills/remember/SKILL.md` after the routing decision
  picked the notepad.
- A user asked "save this for the rest of the chat" → Priority Context.
- A user asked "remember this for a few days" → Working Memory.
- A user asked "never forget this" → MANUAL (with explicit confirmation).

## Steps

### 1. Locate the notepad

- Default: `./notepad.md` at the workspace root.
- Alternate: `./docs/notepad.md` if `./notepad.md` does not exist and
  the docs path does.
- If neither exists, copy `docs/templates/notepad.md` to `./notepad.md`
  in the consumer workspace (do not edit the template itself).

### 2. Read the current state

Use a normal file read. Identify the three sections by the marker
comments (`<!-- OMCS:NOTEPAD:PRIORITY -->`, etc.). The validator uses
the same markers.

### 3. Apply the edit (one of):

**Replace Priority Context.**

- Replace everything between `<!-- OMCS:NOTEPAD:PRIORITY -->` and
  `<!-- /OMCS:NOTEPAD:PRIORITY -->` with the new context.
- Strip leading/trailing whitespace.
- If the new block exceeds 500 characters (excluding markers), abort and
  ask the user to shorten it.

**Append a Working Memory line.**

- Compute UTC ISO 8601 with second precision: `YYYY-MM-DDTHH:MM:SSZ`.
- Append a single line of the form `YYYY-MM-DDTHH:MM:SSZ note` just
  inside the closing `<!-- /OMCS:NOTEPAD:WORKING -->` marker.
- Newlines inside the note are forbidden; collapse them.

**Prune Working Memory.**

- Parse each line. Drop lines with timestamps older than 7 days.
- Never prune MANUAL even if asked. If the user wants to remove a
  MANUAL line, do it as an explicit chat-confirmed edit.

**Append a MANUAL line.**

- Require explicit user confirmation in the same chat ("you said you
  want this remembered forever — confirm: yes/no"). If `yes`, append
  one line above the closing `<!-- /OMCS:NOTEPAD:MANUAL -->` marker.
- Never delete an existing MANUAL line.

### 4. Validate

Run:

```
node --experimental-strip-types scripts/validate-notepad-format.ts ./notepad.md
```

If the validator fails, revert the edit and surface the error. Do not
hand-patch the validator output.

## Anti-patterns

- Letting Priority Context grow past 500 characters by sneaking content
  outside the markers.
- Pruning MANUAL.
- Appending to Priority Context (it is replace-only).
- Writing a multi-line "summary" as a single Working Memory entry; use
  the wiki for anything longer than one line.
- Editing the notepad from a hook.

## Optional MCP integration

If the bridge is installed with `--with-mcp`, the following memory tools
mirror the agent-callable operations above:

| Tool | Effect |
|------|--------|
| `memory_notepad_read` | Returns the notepad text and the three section bodies parsed out of the markers |
| `memory_notepad_append_working` | Appends a single Working Memory line atomically |

These are convenience; the file-tool path remains the contract.

## Governance

### Ownership Class

- **repo-owned**: YES — Checked in at `skills/notepad/SKILL.md` with
  matching template, validator, and tests.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class

- **official-doc**: NO — repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/notepad/SKILL.md`,
  `docs/templates/notepad.md`,
  `scripts/validate-notepad-format.py`,
  `tests/memory/test_validate_notepad_format.py`.
- **runtime-smoke**: YES (optional) — When `cursor-state-bridge` is
  installed with memory tools.

### Claim Summary

`notepad` is the lifecycle skill for `./notepad.md`. It enforces three
sections with distinct lifecycles and an explicit 500-char cap on
Priority Context. The format is validated by a stdlib-only Python script;
edits are made through normal file tools or through the optional MCP
memory tools.

## MCP Integration Points

| Tool/Resource | MCP Server | Purpose | Required |
|---|---|---|---|
| `memory_notepad_read` | cursor-state-bridge (with-mcp) | Read notepad and parse sections | No |
| `memory_notepad_append_working` | cursor-state-bridge (with-mcp) | Append Working Memory line | No |

## Hooks Dependencies

None — the notepad is never written from a hook. `compact-reminder.py`
may mention the MANUAL section in its reminder text (read-only), but
never edits.

## Orchestration Role

- **Lifecycle phase(s)**: any
- **Invoked by**: `remember` (router), user
- **Invokes**: `scripts/validate-notepad-format.py` after each write
- **State contract**: Operates on a single markdown file with three
  marker-bounded sections; never touches workflow-state
- **Failure handling**: Validator failure ⇒ revert the edit, surface the
  error
