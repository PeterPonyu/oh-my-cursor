---
name: decisions
description: "[OMCS] Architecture / decision-record lifecycle skill — one ADR per file under docs/decisions/, with explicit Status enum and supersede semantics."
---

# Decisions

The decisions surface is a directory of architecture / decision-record
files (ADRs) at `./docs/decisions/`, one file per decision, named
`YYYYMMDD-<slug>.md`. The format is enforced by
`scripts/validate-decisions-format.py`; the template is at
`docs/templates/decision.md`.

ADRs are **append-only**. Once an ADR is `accepted`, you do not edit its
body. Subsequent changes happen via a new ADR that supersedes it.

## When to use

- An architectural choice was made (library, schema, protocol).
- A process decision was made that future maintainers should understand
  (commit conventions, release cadence, error-handling policy).
- A reviewer comment from `critic` / `code-reviewer` was elevated to a
  binding choice.

## Skip when

- The decision is reversible and trivial — keep it in the chat or the
  notepad.
- The decision is about *task-life* state — that's workflow-state.
- The information is about *how the system works* — that's the wiki.

## Steps

### New decision

1. Pick a kebab-case slug ≤ 60 characters.
2. Compute today's date: `YYYYMMDD`. Filename:
   `./docs/decisions/YYYYMMDD-<slug>.md`.
3. Copy `docs/templates/decision.md` to that path.
4. Fill the frontmatter: `id` (same as filename without `.md`), `title`,
   `status` (start as `proposed` unless evidence already exists), `date`,
   `supersedes` (filename of older decision or empty), `superseded_by`
   (empty for new), `tags`.
5. Fill the body sections: Context / Decision / Consequences / Evidence.
6. Run `python3 scripts/validate-decisions-format.py
   ./docs/decisions/YYYYMMDD-<slug>.md`.

### Promote `proposed` → `accepted`

1. Add at least one concrete piece of evidence to the Evidence section
   (commit hash, PR link, measurement, test output).
2. Change `status: proposed` → `status: accepted` in the frontmatter.
3. Run the validator.

### Supersede an older decision

1. Create the new ADR following the New Decision steps.
2. Set the new ADR's `supersedes: <old-id>`.
3. Edit the old ADR's frontmatter only: set `status: superseded` and
   `superseded_by: <new-id>`. Do not edit the old ADR's body.
4. Run the validator on both files.

### Deprecate (without superseding)

1. Edit the old ADR's frontmatter: set `status: deprecated`.
2. Leave `superseded_by` empty.
3. Run the validator.

### Reject

If a `proposed` ADR is rejected:

1. Change `status: proposed` → `status: rejected`.
2. Add a one-line note in the Decision section explaining why.
3. Run the validator.

## Allowed status values

`proposed`, `accepted`, `rejected`, `deprecated`, `superseded`. Anything
else fails the validator.

## Anti-patterns

- Editing the Decision or Context section of an `accepted` ADR. Create a
  new ADR that supersedes it instead.
- Setting `status: accepted` without any entry in Evidence.
- Picking a filename that does not match the `id` field.
- Picking a non-ISO date prefix.
- Reusing a slug for two ADRs.

## Governance

### Ownership Class

- **repo-owned**: YES — Checked in at `skills/decisions/SKILL.md`.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class

- **official-doc**: NO — repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/decisions/SKILL.md`,
  `docs/templates/decision.md`,
  `scripts/validate-decisions-format.py`,
  `tests/memory/test_validate_decisions_format.py`.
- **runtime-smoke**: NO — Plain markdown, no runtime tooling required.

### Claim Summary

`decisions` is the lifecycle skill for `./docs/decisions/`. It enforces
ADR-style files with a strict `status` enum and explicit supersede
semantics. ADRs are append-only after they reach `accepted`; updates go
through a new ADR.

## MCP Integration Points

No direct MCP integration. ADRs are plain markdown and the operations are simple file edits.

## Hooks Dependencies

None.

## Orchestration Role

- **Lifecycle phase(s)**: `plan`, `review`
- **Invoked by**: `remember` (router), user, `critic` follow-up
- **Invokes**: `scripts/validate-decisions-format.py` after each write
- **State contract**: One file per decision; never touches workflow-state
- **Failure handling**: Validator failure ⇒ revert and surface the error
