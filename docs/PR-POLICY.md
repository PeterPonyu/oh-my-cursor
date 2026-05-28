# Pull Request (PR) Policy

This document defines the quality gates, validation checklist, and claim-proof governance required for all pull requests merged into the `oh-my-cursor` repository.

---

## 1. Quality Gates & Pre-Submit Validations

Every PR must pass the complete local validation suite before merge. Running the checks on your changes is mandatory.

### Pre-submit Commands
Execute the following verification scripts:

```bash
# 1. Run the core repository backbone checks (validates file structure, wordings, hook readonly gates, and schema contracts)
node --experimental-strip-types scripts/verify-backbone.ts

# 2. Run the end-to-end integration and prompt validation checks against the local Cursor agent CLI
node --experimental-strip-types scripts/test-plugin-on-cursor-cli.ts --run-prompt

# 3. Check that maintained Chinese translations are not older than their English sources
node --experimental-strip-types scripts/validate-translation-freshness.ts
```

---

## 2. Claim-Proof Governance (AGENTS.md Compliance)

Any PR that adds, modifies, or removes a capability claim in `AGENTS.md`, `README.md`, `docs/**`, or `.cursor/rules/**` must conform to the following discipline:

### Ownership & Proof Classes
- **Class Labeling**: Every capability must explicitly state its ownership class (`repo-owned`, `host-product-only`, or `unsupported-or-out-of-scope`) and proof class (`official-doc`, `checked-in-artifact`, or `runtime-smoke`).
- **Forbidden Claims**: Never rewrite `host-product-only` capabilities as `repo-owned`. Never soften out-of-scope/unsupported negatives into implied support.

### References Mapping
- **Same-PR Update**: Any claim modification **must** include an update to `docs/references.md` with official documentation links and the access date in the same change set.
- The `scripts/validate-surface-visibility.ts` checker enforces this mapping.

---

## 3. Translation Freshness

When `README.md` or `AGENTS.md` changes, update the matching Chinese translation in `docs/zh/` in the same PR unless the change is explicitly translation-neutral. The freshness guard compares the latest Git commit touching each English source and its maintained translation, so docs-only drift is caught before merge.

## 4. Pull Request Guidelines

1. **Keep it Docs-First and Small**: Prefer small, focused PRs. Group changes by component.
2. **TypeScript-Only**: All scripts, hooks, and shims must be written in TypeScript, run under native Node.js (`--experimental-strip-types`), and require zero external npm runtime dependencies.
3. **No Tracked Local Configs**: The PR must not contain tracked `.cursor/mcp.json` files (which are gitignored). Use `.cursor/mcp.example.json` to publish configuration changes.
4. **Clean Payloads**: The built payload (`dist/`) must be clean of python cache (`__pycache__`, `*.pyc`) or lock directories.
