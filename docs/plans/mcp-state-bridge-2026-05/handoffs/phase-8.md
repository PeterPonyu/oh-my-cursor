## Handoff: Phase 8 → done (mcp-state-bridge-2026-05)

Closes follow-up F5 from the v2 ADR. The agent-callable surface contract
is now mechanically enforced.

- **Decided**: scan covers exactly the four agent-callable globs:
  `.cursor/agents/*.md`, `skills/**/SKILL.md`, `rules/**/*.mdc`,
  `.cursor/rules/**/*.mdc`. 22 files in total on `main`.
- **Decided**: three offender classes — writer-CLI bypass, stale
  archived-doc path, legacy short-name leakage. The read-only validator
  `scripts/validate-workflow-state.py` is allowlisted (it is not the
  writer CLI).
- **Decided**: self-test runs entirely inside `tempfile.TemporaryDirectory`
  per V2; the working tree is never mutated.
- **Decided**: no agent prompt or skill was rewritten. The Phase 4 work
  + the README polish + the Phase 6 install gate left the surface
  already clean (22/22 surfaces pass the new validator on its first
  run). Phase 8 only adds the structural enforcement so a regression
  surfaces at validator time, not at runtime.
- **Rejected**: making the validator AST-walk Markdown for nested
  Python code blocks. Plain regex over line content covers the three
  current offender classes; AST parsing would add complexity for no
  realised offender shape we have not already caught.
- **Rejected**: extending the validator to broader-link-rot detection
  (already covered by a one-off broken-link audit at validator-build
  time; broken-link count was 0 across all 22 files).
- **Files (Phase 8)**:
  - new: `scripts/validate-agent-bridge-contract.py`
  - patched: `scripts/verify-backbone.sh` (added the validator + chained
    invocation), `scripts/validate-surface-visibility.sh` (required-file
    array), `docs/PRD.yaml` (AC-801..AC-805 rows), consensus plan
    (Phase 8 section), `docs/plans/.../expected-rename-references.txt`
    (regen).
- **Acceptance criteria evidenced**:
  - AC-801: default scan exits 0 (`AGENT_BRIDGE_CONTRACT_OK`); 22 files
    scanned.
  - AC-802: `--self-test` exits 0 (`AGENT_BRIDGE_CONTRACT_SELF_TEST_OK`);
    `git status --porcelain` empty after.
  - AC-803: synthetic `bypass.md` (writer-CLI invocation) detected with
    file:line cite.
  - AC-804: synthetic `stale.md` (`docs/refinement-priority-map.md`
    reference) detected.
  - AC-805: `grep validate-agent-bridge-contract scripts/verify-backbone.sh`
    returns non-empty; required-file arrays in `verify-backbone.sh` and
    `validate-surface-visibility.sh` include the script.

**Plan status**: AC-101..AC-805 all evidenced. `validate-prd-ac-mapping.py`
confirms 50 plan AC IDs ↔ 50 PRD rows.

Next candidate moves (per the prior `/plan` ranking): F8 trace-stats CLI
(S), F2 cross-platform locking (M), F4 sibling cursor-plan-bridge (still
deferred until usage demand).
