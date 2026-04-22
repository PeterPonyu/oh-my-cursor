# Cursor-native Refinement Map

This note records what `oh-my-cursor` should learn from the broader OMC/OMX ->
Copilot/Cursor comparison effort **without** turning the repo into a parity
clone.

The governing rule stays the same as the rest of this repository:

- prefer Cursor-native, repo-owned proof;
- keep host-product capability awareness explicit but bounded; and
- use benchmark evidence to confirm repo-owned improvements instead of rewarding
  fake packaging parity.

Use this note alongside:

- [`docs/confirmed-surfaces.md`](./confirmed-surfaces.md)
- [`docs/state-contract.md`](./state-contract.md)
- [`docs/references.md`](./references.md)
- [`benchmark/README.md`](../benchmark/README.md)

## Learning map: source-system lesson -> Cursor-native translation

| Source-system lesson | Cursor-native translation for this repo | Ownership / proof class here | Benchmark relevance | Preferred implementation medium | Next move |
| --- | --- | --- | --- | --- | --- |
| Durable always-on guidance matters. | Keep root `AGENTS.md` plus `.cursor/rules/` as the canonical repo-owned guidance surface. | `repo-owned` at `checked-in-artifact`. | `surface_visibility` and `backbone_verify` directly depend on these surfaces staying present and truthful. | Root repo files first. | Keep rule/docs quality high before adding richer packaging layers. |
| Users need a visible workflow entry point, even when the host has richer built-ins. | Use docs, benchmark notes, and the landing surface to show the current backbone contract instead of inventing repo-owned skill/plugin bundles. | `repo-owned` docs plus `host-product-only` awareness for richer Cursor features. | Better docs can protect `surface_visibility`, but doc-only refinements should not be mistaken for runtime-score upgrades. | Docs/Pages/validators first. | Keep discoverability high while preserving the smaller Cursor contract. |
| Verification loops should be explicit and repeatable. | Treat local validators and the backbone benchmark as the proof loop for repo-owned behavior. | `repo-owned` at `checked-in-artifact`, optionally strengthened by `runtime-smoke`. | Baseline/enhanced benchmark rows are the main score signal for whether repo-owned proof improved. | Shell + Python support tooling. | Keep benchmark interpretation narrow and truthful rather than chasing cross-host score parity. |
| Durable state discipline matters more than copied runtime storage names. | Keep an explicit state contract and validate canonical repo roots instead of introducing `.omx/`-style runtime state as a shipped Cursor surface. | `repo-owned` state docs/validators; no copied runtime-state claim. | `state_contract` and canonical-root recording are already benchmark-relevant. | Docs + validation scripts. | Expand state guidance only when it tightens repo-owned proof or prevents false benchmark success. |
| Rich product surfaces should only count when they become repo-owned and provable. | Keep MCP, plugins, hooks, subagents, modes, and background agents as `host-product-only` or `unsupported-or-out-of-scope` until this repo ships a concrete artifact and validator. | Currently bounded by `official-doc` and explicit negative wording. | They should not affect scores until the repo intentionally adds them to the benchmarked contract. | Product references first; shipped files only after a deliberate plan. | Queue richer packaging only after official docs, ownership, and validators line up. |

## Benchmark-backed wins

The current checked-in benchmark evidence already proves a few things are
working for the Cursor-native backbone:

- `baseline` reaches **100/120**, which confirms the repo-owned backbone floor:
  default auth, `auto` model availability, surface visibility, state contract,
  and backbone verification.
- `enhanced` reaches **120/120** when optional model-backed smoke returns
  `CURSOR_AGENT_OK`.
- The benchmark history remains tied to the canonical repository root instead of
  transient OMX worker paths, which protects the proof surface from accidental
  worktree-specific overclaims.

These wins matter because they reinforce the current, truthful Cursor contract
instead of pretending this repository already ships plugin/skill/hook bundles.

## Remaining gaps and queued refinements

The comparison work also exposes important gaps that should stay explicit:

1. **No repo-owned plugin, skill, hook, or custom-agent packaging yet.**
   Cursor may support these product surfaces, but this repo intentionally does
   not ship them as checked-in backbone artifacts today.
2. **MCP remains opt-in.**
   The product supports it, but the repo has not chosen a concrete server,
   ownership model, or validator path.
3. **Modes and background agents remain host-product-only.**
   They are useful comparison inputs, but not a checked-in repo capability.
4. **The benchmark is intentionally smaller than `oh-my-copilot`'s.**
   That is a design choice, not a failure. Forcing the same score dimensions
   would create fake parity.

## Investigation rule for non-improving benchmark outcomes

When a refinement fails to raise the benchmark score, investigate before adding
scope:

1. **Was the change only descriptive?**
   - Doc-only improvements can be correct and still leave the score unchanged.
2. **Did the change affect a benchmarked repo-owned surface?**
   - If not, a flat score is expected because the benchmark measures a smaller,
     bounded contract.
3. **If a new repo-owned surface was added, did visibility/validation land too?**
   - A Pages app, new rule family, or other checked-in artifact should only earn
     credit once validators and visible links prove it.
4. **Did the change accidentally blur ownership classes?**
   - If public copy drifts from `host-product-only` to implied `repo-owned`, the
     right fix is stronger wording/validation, not a looser benchmark.

## Plugin-native vs shell+Python boundary recommendation

For `oh-my-cursor`, the current evidence suggests this split:

- **Prefer repo-owned Cursor-native surfaces first** for what the repository
  actually ships today: root guidance, `.cursor/rules`, docs, Pages visibility,
  validators, and benchmark artifacts.
- **Keep shell + Python as support tooling** for validation, canonical-root
  normalization, benchmark reporting, and optional runtime smoke.
- **Defer plugin-native shipping** until the repo chooses a concrete plugin or
  related packaged surface, has current official documentation for that route,
  and adds validator/benchmark coverage so the claim can become repo-owned.

That keeps the repository honest while still leaving room for richer Cursor
packaging later if it becomes both useful and provable.
