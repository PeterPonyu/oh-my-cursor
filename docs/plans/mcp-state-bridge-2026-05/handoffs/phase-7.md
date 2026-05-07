## Handoff: Phase 7 → done (mcp-state-bridge-2026-05)

Closes follow-up F1 from the v2 ADR. Bounded `history[]` retention with
FIFO eviction is now in code, not aspirational.

- **Decided**: compaction runs inside every public library write
  function (`init_state`, `set_state`, `update_acceptance_criterion`,
  `record_failure`, `append_history`) immediately AFTER `_push_history`
  and BEFORE `_atomic_write_state`, so the on-disk document is always
  bounded and concurrent readers never observe a partially-evicted
  state.
- **Decided**: default cap is 1000. `history_cap=0` opts out (sentinel
  for retention disabled). Negative values are normalised to opt-out
  rather than raising.
- **Decided**: cap is a per-call parameter, not a schema field. The
  workflow-state schema stays unchanged (R4 invariant preserved).
- **Decided**: bridge `state_io.py` extracts `history_cap` from tool
  params via a small `_history_cap()` helper that tolerates string
  numerals (Cursor's stdio MCP transport sometimes coerces ints to
  strings) and falls back to the default rather than rejecting the
  call.
- **Rejected**: storing the cap inside the state document. Would
  require schema bump (violates R4) and complicates per-task overrides.
- **Files (Phase 7)**:
  - patched: `.cursor/state/workflow-state.py` (added
    `DEFAULT_HISTORY_CAP`, `_compact_history`, threaded `history_cap`
    kwarg through five public functions and five `cmd_*` shims;
    added shared `_add_history_cap` argparse helper)
  - patched: `mcp/cursor-state-bridge/state_io.py` (added
    `_history_cap` helper; threaded through all five mutating tools)
  - patched: `scripts/validate-workflow-state.py` (added
    `--check-history-cap N` flag with size + monotonicity assertion)
  - new: `mcp/cursor-state-bridge/tests/test_history_compaction.py`
    (six unittest cases covering AC-701..AC-705 plus a defensive
    negative-cap normalisation case)
  - patched: `mcp/cursor-state-bridge/README.md` ("History retention"
    section), `docs/state-contract.md` (History retention paragraph),
    `docs/PRD.yaml` (AC-701..AC-705 rows), consensus plan F1 row
    annotated as shipped.
- **Acceptance criteria evidenced**:
  - AC-701: synthetic 1500-entry seed + `set_state` with default cap →
    history shrinks to 1000.
  - AC-702: oldest 501 entries evicted; first surviving entry matches
    pre-write index 501.
  - AC-703: timestamps stay sorted; `--check-history-cap 1000` exits 0.
  - AC-704: `history_cap=0` skips compaction (1500 + 1 = 1501 entries
    survive).
  - AC-705: most-recent entry is the appended one, with the new note
    verbatim.
- **Regression**: 33/33 unittest cases pass (was 27 + 6 new). Full
  validator chain green; bridge smoke green; install-check green.

Next candidate moves (per the prior `/plan` ranking): F5 agent-prompt
audit (S), F8 trace-stats CLI (S), F2 cross-platform locking (M), F4
sibling cursor-plan-bridge (deferred).
