# Changelog

## 2026-05-07

### MCP layer Phase 3 — full six-tool functional surface + PRD-AC index

- promoted `state_update_acceptance_criterion` and `state_history_append`
  from `-32601` placeholders to functional handlers in
  `mcp/cursor-state-bridge/state_io.py`; `_PLACEHOLDER_TOOLS` in
  `server.py` is now empty (an unknown tool name still returns `-32601`
  with `unknown tool:` prefix)
- `evidence` on `state_update_acceptance_criterion` stays OPTIONAL
  (R4 / AC-302); the schema at `.cursor/state/workflow-state.schema.json`
  is **not** tightened
- shipped `scripts/validate-prd-ac-mapping.py` (AC-305): cross-references
  every `AC-NNN` referenced in the consensus plan against a new
  `mcp_acceptance_criteria` mapping in `docs/PRD.yaml`; rejects orphan
  rows on either side
- added `mcp/cursor-state-bridge/tests/test_acceptance_criteria.py` with
  AC-301..AC-304 coverage (missing-status rejected with -32602, invalid
  status rejected, evidence verbatim/preserved/empty default,
  `state_history_append` preserves top-level fields, `tools/list`
  reports six functional tools with no `not implemented` errors)
- updated `mcp/cursor-state-bridge/tests/test_rpc.py` placeholder test
  to target an unknown tool name (every advertised tool is now functional)
- 27/27 unittest cases pass; PR1 + Phase 2 + Phase 3 regression chain green

### MCP layer Phase 2 — library refactor + shared lock + 3 write-tool promotions

- introduced `.cursor/state/_locking.py` POSIX `fcntl` advisory file_lock
  context manager; placed under `.cursor/state/` (always shipped) so the
  CLI shim never imports across the `--with-mcp` boundary
- refactored `.cursor/state/workflow-state.py` to expose a typed library
  API (`init_state`, `set_state`, `update_acceptance_criterion`,
  `record_failure`, `append_history`, `read_state`); each write function
  acquires the shared `file_lock` and writes atomically via tmp-file
  rename; the existing `cmd_*` argparse handlers became thin shims so
  `python3 .cursor/state/workflow-state.py {init,set,ac,fail}` keeps the
  exact same CLI contract
- added `mcp/cursor-state-bridge/state_io.py` that imports the workflow-state
  library via `importlib.util.spec_from_file_location` and dispatches
  every write tool through it; bridge has zero `subprocess` calls
- promoted `state_init`, `state_set_phase`, `state_record_failure` from
  `-32601` placeholders to functional handlers in `server.py`;
  `state_update_acceptance_criterion` and `state_history_append` stay
  Phase 3 placeholders
- added tests: `mcp/cursor-state-bridge/tests/test_library_api.py`
  (six entrypoints, zero argparse mocks), `tests/test_locking_concurrent.py`
  (two subprocess writers serialise; history monotonic), `tests/test_jail.py`
  (direct unit tests for `resolve_jailed`, `jail_roots`, three jail roots)
- extended `scripts/validate-workflow-state.py` with
  `--check-history-monotonic` flag (AC-208 evidence helper)
- 22/22 unittest cases pass; PR1 + Phase 2 regression chain green

### MCP layer Phase 1 — `cursor-state-bridge` skeleton

- shipped `mcp/cursor-state-bridge/` as a stdio JSON-RPC 2.0 MCP server
  with one functional tool (`state_read`) and five Phase-3 placeholder
  tools that return `-32601` until promoted; package is opt-in via
  `./scripts/install-local-plugin.sh --with-mcp`
- shipped `mcp/cursor-state-bridge/{__init__.py, __main__.py, server.py,
  jail.py}` plus tests under `mcp/cursor-state-bridge/tests/` (10 unittest
  cases passing; subprocess-based JSON-RPC framing tests + jail-escape
  negatives)
- shipped fixtures `mcp/cursor-state-bridge/fixtures/{mcp.example.canonical.json,
  trace-schema.json}` and the byte-equal user-facing template
  `.cursor/mcp.example.json`; `.cursor/mcp.json` stays gitignored and is
  rejected by the structure validator if accidentally tracked
- shipped `scripts/validate-mcp-server-structure.py` (presence + py_compile
  + no-network grep + six-tool-name grep), `scripts/smoke-mcp-cursor-state-bridge.sh`
  (env-gated by `RUN_MCP_BRIDGE_SMOKE=1`; modes `--full`, `--jail-escape`,
  `--from-example`, `--auth`), `scripts/validate-rename-references.py`
  (no-op idempotent in PR1; future-proofs a writer-rename PR)
- patched `scripts/install-local-plugin.sh` with `--with-mcp` flag (default
  OFF) that adds `mcp/` to the rsync include list; patched
  `scripts/check-local-plugin-install.sh` to assert `mcp/` absent from the
  default install and present under `--with-mcp`; patched
  `scripts/validate-plugin-structure.sh` to allowlist
  `.cursor/mcp.example.json`, reject a tracked `.cursor/mcp.json`, and
  expose a `--self-test` mode
- added repo-owned row in `docs/confirmed-surfaces.md` for
  `mcp/cursor-state-bridge/**`; added the bridge documentation surface at
  `docs/mcp-bridge.md` and `docs/mcp-tool-surface.md`; documented
  `.omcs/cursor-state-bridge/` under the existing local scratch-state
  policy in `docs/state-contract.md` (not promoted to a repo-owned surface)
- consensus plan, acceptance criteria, pre-mortem, per-layer test plan, and
  team-plan/team-verify handoffs archived under
  `docs/plans/mcp-state-bridge-2026-05/` (deliberate-mode ralplan, two
  iterations, final critic verdict APPROVE). `.omcs/` remains
  runtime-only — trace logs and captured agent sessions stay there;
  development-process artifacts live under tracked `docs/plans/`.

## 2026-05-06

### Opt-in hook tracing for runtime evidence

- added `.cursor/hooks/_trace.py`, a shared standard-library helper that
  appends one JSON line per hook invocation to a local trace log when
  `OH_MY_CURSOR_HOOK_TRACE=1` is set (default path
  `<repo-root>/.omcs/hook-trace.log`, override via
  `OH_MY_CURSOR_HOOK_TRACE_FILE`); failures inside the tracer are
  swallowed so they never alter hook output, and the helper stays
  read-only with respect to workflow state
- added `.omcs/` to `.gitignore` as the oh-my-cursor scratch directory
  for local trace artifacts; this repo no longer reuses the unrelated
  short-name scratch directory shipped by other projects
- instrumented every wired hook script
  (`session-bootstrap`, `session-summary`, `prompt-router`, `tool-guard`,
  `state-watcher`, `failure-router`, `subagent-bootstrap`,
  `subagent-summary`, `shell-guard`, `shell-debrief`, `read-advisor`,
  `claim-guard`, `compact-reminder`, `stop-gate`) to emit a single trace
  record carrying its decision shape just before printing JSON output
- extended `validate-cursor-workflow-artifacts.py` to require and
  py-compile `_trace.py`, and `check-local-plugin-install.sh` to assert
  it lands in copy-mode installs
- documented the trace flag and the live-runtime capture command in
  `.cursor/hooks/README.md`

### Full-lifecycle Cursor hook coverage

- expanded `.cursor/hooks.json` from four wired events to fourteen of the
  Agent hook events Cursor documents on `cursor.com/docs/agent/hooks`,
  adding stdlib-only Python scripts under `.cursor/hooks/`:
  - `sessionStart` → `session-bootstrap.py` (claim/proof + workflow-state reminder)
  - `sessionEnd` → `session-summary.py` (observational closure summary)
  - `preToolUse` → `tool-guard.py` (asks before non-shell edits to workflow-state.json)
  - `postToolUse` → `state-watcher.py` (validates touched workflow-state.json against the schema with no jsonschema dependency)
  - `postToolUseFailure` → `failure-router.py` (routes failures to the debugger role)
  - `subagentStart` → `subagent-bootstrap.py` (links subagent runs to checked-in role prompts)
  - `subagentStop` → `subagent-summary.py` (observational subagent summary)
  - `afterShellExecution` → `shell-debrief.py` (evidence notes for repo-owned proof commands)
  - `beforeReadFile` → `read-advisor.py` (human-visibility reminder for workflow-state reads)
  - `preCompact` → `compact-reminder.py` (preserves orchestration anchors across compaction)
- intentionally left `beforeMCPExecution`, `afterMCPExecution`,
  `afterAgentResponse`, `afterAgentThought`, and the Tab-surface
  (`beforeTabFileRead`, `afterTabFileEdit`) hooks unwired and documented why
  in `.cursor/hooks/README.md`
- updated the workflow-artifact validator (`required_events` now covers all
  fourteen events), the workflow-artifact smoke (pipes a sample payload to
  every script), `check-local-plugin-install.sh` (asserts every new script
  in copy mode), `verify-backbone.sh`, and `validate-surface-visibility.sh`
- updated `README.md`, `AGENTS.md`, `docs/orchestration.md`,
  `docs/state-contract.md`, `docs/confirmed-surfaces.md`, and `docs/PRD.yaml`
  to enumerate the full hook surface

### Wider hook event coverage

- added `.cursor/hooks/prompt-router.py` (event: `beforeSubmitPrompt`) which
  scans the prompt for repo-owned skill, agent, and phase keywords and, when
  a workflow-state document is reachable, summarizes the current phase plus
  pending acceptance criteria as `additional_context`
- added `.cursor/hooks/shell-guard.py` (event: `beforeShellExecution`) which
  warns on risky shell patterns (force-push, `--no-verify`, `rm -rf`, hard
  reset, branch -D, checkout discard) and requests confirmation
  (`permission=ask`) for a tightly bounded severe set that would corrupt
  repo-owned state files or the local plugin install path
- updated `.cursor/hooks.json`, `.cursor/hooks/README.md`, the orchestration
  surface table, the state-contract doc, the PRD, the install-time copy
  check, the workflow-artifact validator, the workflow-artifact smoke,
  `verify-backbone.sh`, and `validate-surface-visibility.sh` to enumerate the
  four wired events and four hook scripts

### Plugin orchestration first

- introduced `docs/orchestration.md` as the orchestration-first overview that
  ties hooks, skills, agents, and shared workflow state into one explicit
  lifecycle (intake → research → plan → execute → verify → review → done →
  blocked)
- added the shared workflow-state contract under `.cursor/state/` with
  `workflow-state.schema.json`, `workflow-state.example.json`, a README, and a
  stdlib `workflow-state.py` helper for intentional local state writes
- added `skills/phase-controller/SKILL.md` as the orchestration entry skill
- added `.cursor/agents/orchestrator.md` as the entry agent plus
  `.cursor/agents/planner.md` and `.cursor/agents/researcher.md` role prompts
- added `scripts/validate-workflow-state.py` for local schema validation

### Hook lifecycle rename

- renamed `.cursor/hooks/claim-proof-audit.py` → `.cursor/hooks/claim-guard.py`
- renamed `.cursor/hooks/completion-summary-audit.py` →
  `.cursor/hooks/stop-gate.py`
- `stop-gate.py` now optionally reads an active workflow-state document (via
  `OH_MY_CURSOR_WORKFLOW_STATE` or a `workflow_state` field in the stop event)
  and surfaces pending or failed acceptance criteria in its reminder
- updated `.cursor/hooks.json`, validators, smoke wrappers, install/check
  scripts, and `.cursor/hooks/README.md` to use the new lifecycle-style names
- the local install copy mode now also ships `.cursor/state/` so the workflow
  contract is available to a loaded Cursor plugin payload

## 2026-04-22

### Repo-root Cursor plugin promotion

- added a repo-root plugin manifest at `.cursor-plugin/plugin.json`
- added a minimal shipped plugin payload:
  - `rules/repo-owned-plugin-boundary.mdc`
  - `skills/local-plugin-check/SKILL.md`
- updated docs and validators so the repo now truthfully claims a small,
  checked-in Cursor plugin surface instead of only describing one

### Plugin install + smoke hardening

- added `scripts/install-local-plugin.sh` for reproducible local plugin setup
- added retry/backoff in `scripts/smoke-cursor-agent.sh` for transient
  connection-loss recovery in model-backed Cursor smoke
- refreshed benchmark evidence on top of the hardening commit so the checked-in
  proof matches the current install/smoke path
