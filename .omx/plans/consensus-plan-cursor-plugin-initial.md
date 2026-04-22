# Initial consensus plan: make oh-my-cursor a ready-to-use Cursor plugin

## 1) Principles
1. Promotion must be explicit, not implied.
2. Keep claim/proof classes aligned.
3. Start with the smallest viable plugin surface.
4. Local installability is the readiness bar.
5. Validators must evolve with the boundary.

## 2) Decision Drivers
1. Truthful ownership transition from current out-of-scope wording and validators.
2. Fastest path to usable install via `.cursor-plugin/plugin.json` and local plugin loading.
3. Low-friction verification without an official CLI-only plugin test runner.

## 3) Viable Options
### Option A — Minimal single-plugin promotion
- Pros: smallest scope; fastest path; simplest validator/doc transition.
- Cons: richer Cursor-native surfaces deferred.

### Option B — Full-surface plugin promotion
- Pros: strongest complete-plugin story.
- Cons: highest ambiguity/risk; hardest to validate.

### Option C — Multi-plugin repo architecture
- Pros: clear separation for future expansion.
- Cons: unnecessary complexity for initial readiness.

## 4) Recommended Option + why
Recommend Option A: promote one minimal plugin rooted at `.cursor-plugin/plugin.json` first. It fits the repo's current docs/validator reality, minimizes boundary churn, and gets to a truthful ready-to-use local install path fastest.

## 5) Implementation Phases
1. Boundary and artifact definition.
2. Packaging contract design.
3. Validator and benchmark transition.
4. Docs and proof alignment.
5. Readiness verification and release gate.

## 6) Acceptance Criteria
- One clearly defined plugin root at `.cursor-plugin/plugin.json`.
- README/docs stop describing the shipped v1 plugin surface as out of scope.
- Validators allow the approved plugin artifact and still guard unowned surfaces.
- Local install via `~/.cursor/plugins/local` + Cursor reload is documented and reproducible.
- If multi-plugin support is unnecessary, `.cursor-plugin/marketplace.json` remains explicitly deferred.

## 7) Verification
- Static checks for artifact presence, metadata, and docs/ownership alignment.
- Manual local install/reload smoke in Cursor.
- Regression checks for docs/benchmark validations.
- A recorded proof note for the smoke path.

## 8) Risks/Mitigations
- Wording drift ahead of artifact reality -> gate on artifact + validators + smoke proof.
- Existing validators block plugin-native files -> classify each check as retire/narrow/replace.
- Scope creep into hooks/MCP/agents -> strict v1 surface definition.
- Manual-only testing brittleness -> keep smoke path short and deterministic.

## 9) Suggested team execution lanes for a later $team run
1. Packaging lane (`executor`, high)
2. Validator/benchmark lane (`test-engineer` or `executor`, high)
3. Docs/boundary lane (`writer`, high)
4. Verification lane (`verifier`, high)
5. Optional official-doc confirmation lane (`researcher`, medium)
