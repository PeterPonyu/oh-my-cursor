# Fallback policy

This repository intentionally uses a strict fallback policy so it stays aligned
with documented Cursor behavior and with the shared claim/proof discipline.

## Default fallback

If a Cursor surface is ambiguous, newly released, or not clearly documented,
fall back to the smallest proven `repo-owned` surface:

- root `AGENTS.md` guidance;
- `.cursor/rules/` project rules;
- `.cursor/hooks.json` plus `.cursor/hooks/` helpers;
- `.cursor/agents/` project agents;
- the checked-in repo-root plugin manifest plus referenced payloads;
  and
- ordinary repository documentation and validators.

## Ownership fallback rules

When wording a capability, choose the narrowest truthful class:

| If the surface is... | Allowed wording |
| --- | --- |
| checked in and validated by this repo | `repo-owned` |
| supported by Cursor but not provisioned here | `host-product-only` |
| intentionally absent from this repo backbone | `unsupported-or-out-of-scope` |

This means:

- do **not** upgrade a host-product capability into a repo-owned claim;
- do **not** hide an unsupported surface behind vague language such as “could
  be added later” when the current repo does not ship it; and
- do **not** promote a stronger proof class than current docs, checked-in
  artifacts, or smoke evidence support.

## Specific non-claims

Until they are directly proven and deliberately adopted, this repository does
**not** claim:

- custom mode provisioning;
- background-agent provisioning;
- a default MCP configuration; or
- marketplace publication as the proof story for local plugin use.

Hooks and agents are no longer listed as non-claims because the repo now ships
`.cursor/hooks.json`, `.cursor/hooks/`, and `.cursor/agents/`. Their runtime
behavior remains bounded by Cursor's trusted-workspace execution and local
manual verification.

## Local plugin rule

The repo-root plugin is intentionally bounded. If a future edit proposes extra
plugin-owned surfaces, keep the same proof discipline:

1. concrete checked-in artifact;
2. validator coverage;
3. truthful docs; and
4. reproducible local verification notes.

If one of those is missing, keep the surface deferred instead of broadening the
repo-owned contract by wording alone.

## MCP policy

MCP is documented by Cursor, but this repo still leaves it opt-in by default.
A future MCP addition should only land with:

1. the chosen server name;
2. how authentication works;
3. whether config is project-local or user-global; and
4. a reproducible verification note.

## Proof-strength ceiling

Use the strongest wording supported by actual evidence, and no stronger:

- `official-doc` for documented Cursor product capability;
- `checked-in-artifact` for surfaces the repo actually ships and validates; and
- `runtime-smoke` only when optional authenticated/model-available smoke runs
  succeed.

If the smoke path is skipped or unavailable, keep wording bounded to
`official-doc` + `checked-in-artifact` strength.

## Why this matters

A small confirmed backbone is more durable than a larger speculative one.
This repo is supposed to be safe to trust quickly, so unsupported packaging or
runtime claims are treated as release blockers rather than marketing copy.
