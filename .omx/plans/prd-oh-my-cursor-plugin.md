# PRD — Promote oh-my-cursor into a ready-to-use Cursor plugin

## Objective
Turn `oh-my-cursor` into a repo-owned, ready-to-use Cursor plugin rooted at the repository root while preserving truthful ownership/proof boundaries.

## Scope
### In scope
- `.cursor-plugin/plugin.json`
- minimal shipped plugin payload (start with rules + skills)
- docs and ownership/proof updates
- validator updates from negative to positive plugin proof
- local-load instructions via `~/.cursor/plugins/local` and Cursor reload

### Out of scope for initial promotion
- default MCP config without a chosen server
- shipping every optional plugin primitive on day one
- assuming a CLI-only plugin test runner exists
- marketplace publication as a required completion gate

## Acceptance criteria
1. Valid `.cursor-plugin/plugin.json` exists.
2. At least one plugin-owned rule and one plugin-owned skill ship.
3. Docs stop claiming plugin packaging is unsupported for this repo.
4. Validators positively prove plugin structure and truthful copy.
5. Local plugin loading instructions are documented and reproducible.
