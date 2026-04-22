# Plugin-native vs Shell+Python Boundary Review

This note is a **review/governance document** for `oh-my-cursor`. It does not
change the repository's current contract. Instead, it records why the current
Cursor-native backbone should remain docs/rules/validators first, with shell +
Python as support tooling and richer plugin-native shipping deferred until it is
both useful and provable.

Use it alongside:

- [`docs/confirmed-surfaces.md`](./confirmed-surfaces.md)
- [`docs/fallback-policy.md`](./fallback-policy.md)
- [`docs/refinement-priority-map.md`](./refinement-priority-map.md)
- [`benchmark/README.md`](../benchmark/README.md)

## Review verdict

The current repository boundary is coherent:

- **repo-owned Cursor-native surfaces** are root guidance, `.cursor/rules`,
  bounded docs, Pages visibility, validators, and benchmark artifacts;
- **shell + Python** are the right current medium for validation, canonical-root
  normalization, benchmark reporting, and optional runtime smoke; and
- **plugin/skill/hook/custom-agent packaging** should stay deferred until this
  repo intentionally adopts a concrete packaged surface with validator and
  benchmark coverage.

The main review recommendation is to **keep the boundary explicit** so future
docs or experiments do not quietly convert product-awareness into fake
repo-owned packaging claims.

## Boundary map

| Concern | Canonical medium now | Why this medium is correct | What should not be promoted yet |
| --- | --- | --- | --- |
| Always-on repo guidance and ownership rules | Root `AGENTS.md`, `.cursor/rules/`, bounded docs | These are the checked-in surfaces the repo actually ships and validates today. | Do not imply plugin/skill/hook packaging just because Cursor product docs mention them. |
| Pages visibility and public proof links | Checked-in app/workflow/exported HTML plus validators | The site is trustworthy only when it stays visibly tied to docs, references, state contract, and benchmark notes. | Do not let the landing surface hide the smaller benchmark contract or imply richer packaging. |
| Validation, canonical-root normalization, benchmark history, and optional smoke | Shell + Python in `scripts/` and `benchmark/` | These are proof/support responsibilities, not the repo's public customization surface. | Do not market these scripts as repo-native plugin features. |
| Plugins, hooks, skills, subagents, modes, MCP, background agents | Product-awareness in docs/references only unless a concrete checked-in artifact lands | Cursor may support these surfaces, but this repo does not currently ship them as repo-owned files. | Do not upgrade `host-product-only` or `unsupported-or-out-of-scope` wording into implied repo ownership. |

## Code-quality review observations

### 1. The repo's strongest current quality comes from explicit restraint

The current docs and validators repeatedly state that this repository does
**not** ship checked-in plugin bundles, skill bundles, hook manifests, or
custom-agent packaging.

That restraint is good engineering, not missing ambition:

- it keeps the public contract truthful;
- it makes the benchmark easier to interpret;
- it avoids copied parity dimensions from `oh-my-copilot`; and
- it reduces maintenance debt from unvalidated packaging experiments.

### 2. Shell + Python are support infrastructure here, not a second-class failure

The shell/Python layer does important work:

- validating visibility and state-contract claims;
- checking auth/model assumptions through bounded commands;
- normalizing canonical repo roots for benchmark artifacts; and
- producing repeatable benchmark history and optional runtime smoke evidence.

That is exactly the right job for support tooling in the current repo shape.
The mistake would be to read that tooling as evidence that the repo already
ships plugin-native behavior.

### 3. Plugin-native shipping needs a promotion gate, not a slow wording drift

Because Cursor product docs now mention richer surfaces, the main risk is
incremental wording drift. A future packaged surface should only be promoted
when all of these are true:

1. a concrete checked-in artifact exists;
2. the ownership class intentionally changes from non-owned to repo-owned;
3. a validator proves the artifact is present and correctly wired; and
4. the benchmark contract is updated so the new repo-owned surface can be
   measured truthfully.

Without that gate, plugin-aware copy can become fake repo-owned capability
language.

## Benchmark interpretation for boundary decisions

This review should guide how benchmark outcomes are read:

1. **Doc/rule/visibility improvements may be correct even when scores stay flat.**
   - The current benchmark measures a smaller contract than `oh-my-copilot`.
2. **Support-tooling improvements may increase proof quality without changing the shipped surface.**
   - Canonical-root normalization and clearer validators are good examples.
3. **A score should only expand when the repo-owned contract expands.**
   - Otherwise benchmark growth would reward wording drift instead of shipped,
     validated capability.

## Review guardrails for future edits

Before promoting a richer Cursor surface, ask:

1. **Is there a concrete checked-in artifact for it in this repo?**
2. **Can a local validator prove it exists and stays boundary-truthful?**
3. **Does the benchmark contract need a new dimension, or should the current score remain unchanged?**
4. **Would the public wording still distinguish repo-owned from host-product-only support?**

If any answer is “no,” keep the feature as product-awareness or a future-work
candidate instead of a shipped repo claim.

## Recommendation

For `oh-my-cursor`, the near-term rule should stay:

- **keep repo-owned Cursor-native surfaces small and explicit;**
- **keep shell + Python as proof/support tooling;** and
- **treat plugin-native shipping as an explicit promotion event that requires new artifacts, validators, and benchmark coverage.**

That preserves the repository's strongest current quality: a small truthful
backbone with clear ownership classes, instead of a larger but blurrier parity
story.
