# Open Questions

## mcp-state-bridge-2026-05 (v2) - 2026-05-07

- [ ] F3 (feature decision): should the CLI surface (`python3 .cursor/state/workflow-state.py ...`) remain user-facing or become bridge-only? — Decide after 30 days of trace data on CLI usage post-Phase 6.
- [ ] F1 (operator-chosen threshold): what `history[]` length triggers compaction? — Affects long-running tasks; default proposed in v2 is "no cap" until F1 lands.
- [ ] F2 (Windows locking): pick a cross-platform locking library (`portalocker` vs `filelock`) — needs a Windows contributor signal before we commit to a dependency.
- [ ] F4 (plan-bridge scope): does the future plan-bridge expose the same six-tool surface, or a different shape (e.g., `plan_init`, `plan_step_complete`, `plan_record_artifact`)? — Open until plan IO writers are surveyed.
- [ ] F5 (agent prompt rewrite): which agents beyond `orchestrator.md` reference the legacy CLI writer in their writer guidance, and do any of them need bespoke prompt language vs a shared snippet? — Phase 4 grep gate (AC-401) will surface the exact list.
- [ ] e2e gating: should `scripts/smoke-cursor-agent.sh --bridge-e2e` and `--bridge-tmux` share a single env gate (`RUN_MCP_BRIDGE_E2E=1`) or split per-mode? — Currently planned as a single shared gate; revisit if tmux flakiness diverges from stream-json.
- [ ] Cursor secret-store: does the team want `docs/mcp-auth.md` to document a specific Cursor settings recipe for secret injection, or stay generic? — Pending product feedback.
