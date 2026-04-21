# Hard fallback policy

This repository intentionally uses a strict fallback policy so it stays aligned
with documented Cursor behavior.

## Default fallback

If a Cursor surface is ambiguous, newly released, or not clearly documented,
fall back to:

- root `AGENTS.md` guidance;
- `.cursor/rules/` project rules; and
- ordinary repository documentation.

## Specific non-claims

Until they are directly proven, this repository does **not** claim:

- CLI-native plugin/package loading as a stable local distribution model;
- repo-file provisioning for custom modes;
- repo-file provisioning for background agents; or
- a checked-in runtime/memory/worker system comparable to other orchestration
  projects.

## MCP policy

MCP is documented by Cursor, but this repo still leaves it opt-in by default.
A future MCP addition should only land with:

1. the chosen server name;
2. how authentication works;
3. whether config is project-local or user-global; and
4. a reproducible verification note.

## Why this matters

A small confirmed backbone is more durable than a larger speculative one.
This repo is supposed to be safe to trust quickly, so unsupported packaging or
runtime claims are treated as release blockers rather than marketing copy.
