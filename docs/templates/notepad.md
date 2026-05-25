# Project notepad (template)

> Copy this file to your workspace as `notepad.md` (or `docs/notepad.md`)
> and remove this template header. `scripts/validate-notepad-format.py`
> reads the runtime file you point it at; this template is what the
> validator uses for its `--self-test` golden.

The notepad is a three-section markdown file that survives chat compaction
because it lives on disk. Each section has a specific lifecycle and
character cap.

## Priority Context

<!-- OMCS:NOTEPAD:PRIORITY -->
<!-- Replace-on-write. Max 500 characters between the markers above and below. -->
<!-- The most recent priority context replaces any previous one. -->
<!-- /OMCS:NOTEPAD:PRIORITY -->

## Working Memory

<!-- OMCS:NOTEPAD:WORKING -->
<!-- Append-only with ISO 8601 timestamps. Agents may prune entries older -->
<!-- than 7 days. Each entry is a single line: "YYYY-MM-DDTHH:MM:SSZ note". -->
<!-- /OMCS:NOTEPAD:WORKING -->

## MANUAL

<!-- OMCS:NOTEPAD:MANUAL -->
<!-- Never auto-pruned. Owned by the user; agents read but never delete. -->
<!-- Use this section for invariants that should stay through every session: -->
<!--   - hard project constraints, -->
<!--   - explicit user preferences ("never run npm install without asking"), -->
<!--   - links to canonical docs the agent must consult. -->
<!-- /OMCS:NOTEPAD:MANUAL -->
