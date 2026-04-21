# oh-my-cursor repository instructions

This repository is a Cursor-native backbone, not a parity clone of another
agent framework.

## Core rules

- Keep the repo docs-first and evidence-backed.
- Prefer root `AGENTS.md` plus `.cursor/rules/` before inventing new packaging
  layers.
- When changing capability claims, update `docs/references.md` with official
  links and the access date.
- Label inference as inference.

## Hard boundaries

- Do **not** claim CLI-native plugin/package loading unless directly proven with
  current official Cursor documentation and a reproducible proof note.
- Do **not** assume custom modes have a checked-in project file format unless
  that format is officially documented.
- Do **not** assume background agents are provisioned from repo files unless
  that workflow is officially documented.
- Do **not** add MCP config until a concrete server and ownership model are
  chosen.

## Editing posture

- Prefer small, reviewable documentation and rule changes.
- Keep wording Cursor-native instead of translating terminology from other
  tools one-to-one.
- If a surface is ambiguous, fall back to plain repository guidance and scoped
  rules rather than speculative automation.
