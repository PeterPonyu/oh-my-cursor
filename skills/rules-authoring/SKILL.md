---
name: rules-authoring
description: "[OMCS] Step-by-step skill for adding a new rule (plugin-shipped or workspace dev) without breaking install parity or claim/proof discipline."
---

# Rules authoring

The companion to `rules/rules-authoring.mdc`. The rule states the
contract; this skill walks the agent through the steps.

## When to use

- User said "add a rule" / "write a rule" / "make a rule" / "memo this
  as a rule".
- A finding from `remember` was routed to a rule (it applies repo-wide
  or workspace-wide and is not data).
- A reviewer comment from `critic` / `code-reviewer` should become
  binding policy.

## Skip when

- The finding is data (use the memory layer instead).
- The finding is a single function's docstring (just edit the code).

## Steps

### 1. Pick the scope

| Goal | Scope | Path |
|------|-------|------|
| Apply to every consumer workspace that installs this plugin | plugin-shipped | `rules/<kebab-name>.mdc` |
| Apply only when editing this repository | workspace dev | `.cursor/rules/<NN>-<kebab-name>.mdc` (NN = two-digit ordering prefix) |

The install script copies `rules/` into the consumer plugin payload but
explicitly excludes `.cursor/rules/`. If you put a consumer-needed rule
in `.cursor/rules/`, consumers will never see it.

### 2. Draft the frontmatter

Plugin-shipped:

```mdc
---
description: "[OMCS] <one-sentence purpose, present tense, ASCII only>"
globs:
	- <relative path glob 1>
	- <relative path glob 2>
alwaysApply: false
---
```

Workspace dev (omit the `[OMCS]` brand prefix; use `alwaysApply: true`
for repo-wide invariants):

```mdc
---
description: <short title>
alwaysApply: true
---
```

Use tabs for `globs:` indentation to match existing rules.

### 3. Write the body

Keep it short. Two pages maximum. Use a hard `## When to use` /
`## Hard rules` / `## Anti-patterns` skeleton if the rule is
non-trivial.

### 4. Wire into the plugin contract

For a plugin-shipped rule:

- Add the path to the `required` array in
  `scripts/validate-plugin-structure.sh` if the rule is part of the
  contract (most are; one-off scoped rules may be omitted from
  `required` but should still ship).
- Confirm `scripts/install-local-plugin.ts` includes `/rules/***`
  (already does — no change needed).
- Confirm `scripts/validate-rules-install-parity.sh` passes after the
  next install dry-run.

For a workspace dev rule:

- Confirm the install script excludes `.cursor/rules/` (it does).
- Optionally add a brief mention to `docs/local-plugin-verification.md`
  if the rule changes how maintainers verify the plugin.

### 5. Validate

Run, in order:

```
node --experimental-strip-types scripts/validate-agent-bridge-contract.ts
node --experimental-strip-types scripts/validate-public-language.ts
bash scripts/validate-plugin-structure.sh
bash scripts/validate-rules-install-parity.sh   # for plugin-shipped rules
```

If any fail, fix and re-run. Never bypass.

### 6. Cross-reference

- Cite the new rule from any SKILL.md that depends on it.
- Update `docs/confirmed-surfaces.md` to add an ownership row.
- Update `CHANGELOG.md` under Unreleased.
- If the rule restates an external best practice, cite the source in
  `docs/references.md` with `accessed: YYYY-MM-DD`.

## Anti-patterns

- Writing rules that document hypothetical capabilities. Rules describe
  enforced behavior, not aspirations.
- Putting consumer-relevant policy under `.cursor/rules/`. Move to
  `rules/`.
- Adding `alwaysApply: true` because writing globs felt like too much
  work. Use globs.
- Bundling unrelated rules in one file. One rule per file makes them
  easy to enable, disable, or remove.
- Copying rule content from sibling agent plugins without adapting to the
  Cursor surface (no slash commands, no non-Cursor config roots, no
  model-name routing).

## Governance

### Ownership Class

- **repo-owned**: YES — Checked in at `skills/rules-authoring/SKILL.md`.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class

- **official-doc**: NO — repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/rules-authoring/SKILL.md`,
  `rules/rules-authoring.mdc`,
  `scripts/validate-plugin-structure.sh`,
  `scripts/validate-rules-install-parity.sh`,
  `scripts/validate-agent-bridge-contract.ts`,
  `scripts/validate-public-language.ts`.
- **runtime-smoke**: NO — All checks are repo-local static validators.

### Claim Summary

`rules-authoring` walks the agent through adding a `.mdc` rule to the
right scope (plugin-shipped vs workspace dev), wiring it into the
install / validation contract, and cross-referencing it from the
surfaces table. It enforces the install parity rule via the matching
bash validator.

## MCP Integration Points

No direct MCP integration. Rule authoring is a static edit + validator workflow.

## Hooks Dependencies

None.

## Orchestration Role

- **Lifecycle phase(s)**: any (most useful in `plan` or `review`)
- **Invoked by**: `remember` (router), user, `critic` / `code-reviewer` follow-up
- **Invokes**: `local-plugin-check` (after the edit) and the four
  validators listed in step 5
- **State contract**: Static repo edits; never touches workflow-state
  or the memory layer
- **Failure handling**: Validator failure ⇒ revert and surface the error
