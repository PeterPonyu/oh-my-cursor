# Plugin Promotion Boundary Review

This note is a **review/governance document** for `oh-my-cursor`. It explains
why the approved plugin promotion should stay intentionally small: a repo-root
plugin manifest, a minimal shipped rule/skill payload, truthful docs, and
support-tooling that proves the boundary without pretending every adjacent
Cursor surface is now repo-owned.

Use it alongside:

- [`docs/confirmed-surfaces.md`](./confirmed-surfaces.md)
- [`docs/fallback-policy.md`](./fallback-policy.md)
- [`docs/local-plugin-verification.md`](./local-plugin-verification.md)
- [`docs/refinement-priority-map.md`](./refinement-priority-map.md)
- [`benchmark/README.md`](../benchmark/README.md)

## Review verdict

The approved repository boundary is coherent:

- **repo-owned Cursor-native surfaces** are root guidance, `.cursor/rules`, the
  repo-root plugin manifest, the minimal shipped plugin rule/skill payload,
  bounded docs, Pages visibility rules, validators, and benchmark artifacts;
- **shell + Python** remain the right medium for validation, canonical-root
  normalization, benchmark reporting, and optional runtime smoke; and
- **hooks, custom agents, commands, MCP defaults, and other richer surfaces**
  stay deferred until this repo intentionally adopts concrete artifacts with
  validator and benchmark coverage.

The main review recommendation is to **keep the promotion boundary explicit** so
future docs or experiments do not quietly convert product-awareness into fake
repo-owned capability claims.

## Boundary map

| Concern | Canonical medium now | Why this medium is correct | What should not be promoted yet |
| --- | --- | --- | --- |
| Always-on repo guidance and ownership rules | Root `AGENTS.md`, `.cursor/rules/`, bounded docs | These are the checked-in surfaces the repo actually ships and validates today. | Do not imply hooks or custom-agent surfaces just because Cursor product docs mention them. |
| Repo-root plugin manifest plus shipped rule/skill payload | Checked-in plugin files under the repo root | This is the smallest useful plugin surface that can be reviewed, documented, and locally tested without broadening scope. | Do not let the minimal plugin payload become a back door for unproven commands, hooks, or MCP defaults. |
| Local plugin verification notes | Checked-in documentation plus manual user-environment steps | The walkthrough is reproducible and truthful about what the repo owns versus what the user's Cursor install must do. | Do not rewrite manual reload/local-install steps as if the repo automates them. |
| Validation, canonical-root normalization, benchmark history, and optional smoke | Shell + Python in `scripts/` and `benchmark/` | These are proof/support responsibilities, not the repo's public customization surface. | Do not market these scripts as plugin runtime features. |
| Hooks, custom agents, commands, MCP defaults, background agents | Product-awareness in docs/references only unless a concrete checked-in artifact lands | Cursor may support these surfaces, but this repo intentionally keeps them outside the current shipped boundary. | Do not upgrade `host-product-only` or `unsupported-or-out-of-scope` wording into implied repo ownership. |

## Code-quality review observations

### 1. The plugin promotion is strongest when it stays narrow

The approved plugin promotion does **not** need to ship every possible Cursor
surface. Its strength comes from being reviewable:

- one repo-root manifest;
- a small plugin payload;
- docs that describe the actual ownership boundary; and
- validators that prove the repo-owned files exist and the deferred surfaces
  remain deferred.

### 2. Shell + Python remain support infrastructure, not a design failure

The shell/Python layer still does important work:

- validating visibility and state-contract claims;
- checking auth/model assumptions through bounded commands;
- normalizing canonical repo roots for benchmark artifacts; and
- producing repeatable benchmark history and optional runtime smoke evidence.

That is the correct job for support tooling in this repo shape. The mistake
would be to read that tooling as evidence that every adjacent Cursor feature now
belongs inside the plugin payload.

### 3. Future boundary growth still needs a promotion gate

Because Cursor product docs mention richer surfaces, the main risk remains
incremental wording drift. A future adjacent surface should only be promoted
when all of these are true:

1. a concrete checked-in artifact exists;
2. the ownership class intentionally changes from non-owned to repo-owned;
3. a validator proves the artifact is present and correctly wired; and
4. the benchmark/docs contract is updated so the new repo-owned surface can be
   measured truthfully.

Without that gate, product-aware copy can become fake repo-owned capability
language.

## Benchmark interpretation for boundary decisions

This review should guide how benchmark outcomes are read:

1. **Doc/rule/plugin-structure improvements may be correct even when scores stay flat.**
   - The current benchmark still measures a smaller contract than
     `oh-my-copilot`.
2. **Support-tooling improvements may increase proof quality without expanding the plugin payload.**
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
- **ship the repo-root plugin only at the smallest useful scope;**
- **keep shell + Python as proof/support tooling;** and
- **treat any richer adjacent surface as a separate promotion event that
  requires new artifacts, validators, and benchmark coverage.**

That preserves the repository's strongest quality: a small truthful plugin-ready
backbone with clear ownership classes instead of a larger but blurrier parity
story.
