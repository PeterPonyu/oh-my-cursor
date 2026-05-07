# Changelog

## 2026-05-07

### MCP layer Phase 8 — agent-callable surface contract enforcement

Closes follow-up F5. Mechanically locks down what was already a clean
status quo across the 22 agent-callable .md / .mdc files.

- new `scripts/validate-agent-bridge-contract.py` (stdlib only) with two
  modes:
  - default: scans `.cursor/agents/*.md`, `skills/**/SKILL.md`,
    `rules/*.mdc`, and `.cursor/rules/*.mdc`. Detects three classes of
    offenders: writer-CLI bypass (direct references to
    `.cursor/state/workflow-state.py` / `scripts/workflow-state.py`),
    stale archived-doc paths (`docs/refinement-priority-map.md` /
    `docs/plugin-boundary-review.md` / `docs/fallback-policy.md` —
    must use `docs/archive/`), and legacy short-name leakage.
  - `--self-test`: seeds three synthetic offenders + a clean fixture in
    a `tempfile.TemporaryDirectory` (V2 isolation), confirms each is
    detected, confirms the clean fixture passes; never mutates the
    working tree.
- chained `validate-agent-bridge-contract.py` into `verify-backbone.sh`
  and added it to the required-file arrays in `verify-backbone.sh` and
  `validate-surface-visibility.sh`.
- 22 of 22 agent-callable surfaces clean on the first run; no prompt
  rewrites needed.
- broader audit also confirmed: 0 broken cross-doc links across the
  same surfaces.
- `validate-prd-ac-mapping.py` now reports 50 plan AC IDs ↔ 50 PRD rows.

ACs evidenced: AC-801..AC-805.

### MCP layer Phase 7 — bounded history[] retention with FIFO eviction

Closes follow-up F1 from the v2 ADR.

- added `DEFAULT_HISTORY_CAP = 1000` and `_compact_history(state, cap)`
  to `.cursor/state/workflow-state.py`; threaded `history_cap` kwarg
  through every public library write function (`init_state`,
  `set_state`, `update_acceptance_criterion`, `record_failure`,
  `append_history`) and through every `cmd_*` argparse shim. Compaction
  runs immediately after `_push_history` and before
  `_atomic_write_state`, so the on-disk document is always bounded
- bridge `mcp/cursor-state-bridge/state_io.py` now extracts
  `history_cap` from each mutating tool's params (default 1000;
  accepts string numerals; falls back to default on invalid input)
- `scripts/validate-workflow-state.py` gained `--check-history-cap N`
  which asserts both the size cap (`len(history) <= N`) and timestamp
  monotonicity post-eviction
- new `mcp/cursor-state-bridge/tests/test_history_compaction.py`
  (AC-701..AC-705 + defensive negative-cap normalisation): 33/33
  unittest cases pass
- `history_cap=0` is the documented opt-out sentinel; negative values
  normalised to opt-out
- workflow-state schema unchanged (R4 preserved); cap is a per-call
  knob, not a schema field
- updated `mcp/cursor-state-bridge/README.md`, `docs/state-contract.md`,
  `docs/PRD.yaml` (rows for AC-701..AC-705), consensus plan F1 row
  marked shipped, `docs/plans/.../handoffs/phase-7.md` ledger

### Docs cleanup — polish README, archive dev-process notes

- polished `README.md` from 228 to 119 lines: tightened the intro to a
  single claim/proof discipline section, cut "Start here" from 22
  links to 6 essentials (`AGENTS.md`, `docs/orchestration.md`,
  `docs/state-contract.md`, `docs/mcp-bridge.md`, `docs/PRD.yaml`,
  `CHANGELOG.md`), folded the Plugin-orchestration intro and
  Design-rule list into the ownership map, dropped the Landing-surface
  contract section
- moved three dev-process docs that no longer drive the live entry
  path into `docs/archive/`:
  `docs/refinement-priority-map.md`,
  `docs/plugin-boundary-review.md`,
  `docs/fallback-policy.md`
- updated dependents: `scripts/verify-backbone.sh` (new
  `docs/archive/fallback-policy.md` path + grep assertions),
  `scripts/validate-surface-visibility.sh` (dropped the discoverability
  assertion that required specific links in README's Start here),
  `scripts/validate-benchmark-evidence.sh` (now requires
  `archive/refinement-priority-map.md` and `archive/plugin-boundary-review.md`
  in benchmark README), `scripts/smoke-cursor-agent.sh` (task scenario
  fixture updated), `benchmark/README.md` (paragraph rewrite explaining
  the archival), `benchmark/test_history_cleanup.py` (fixture string
  updated). Frozen historical evidence under
  `benchmark/results/{baseline,enhanced}/*.json` was left untouched
- the archived docs remain checked in for reference; new contributors
  see only the live entry path through the README

### MCP layer Phase 6 — auth shake + structured trace lane + mcp-auth doc

- shipped `mcp/cursor-state-bridge/_trace.py`: JSONL emitter writing to
  `.omcs/cursor-state-bridge/trace.jsonl` (V3 path, distinct from
  `.omcs/hook-trace.log`); 10 MiB FIFO eviction; opt-out via
  `OH_MY_CURSOR_MCP_TRACE=0`; failures inside the tracer are swallowed
- shipped `mcp/cursor-state-bridge/auth.py`: optional auth shake gated
  on `OH_MY_CURSOR_MCP_TOKEN`; default OFF; when configured, the bridge
  rejects `initialize` requests without a matching `params.token`
  (JSON-RPC `-32001`) and refuses to honour any subsequent call until a
  successful handshake
- wired both into `mcp/cursor-state-bridge/server.py`: every JSON-RPC
  call writes one structured trace record (ts, tool, phase, result,
  duration_ms, optional task_id / error_class) and the dispatcher gates
  on auth state when a token is configured
- shipped `scripts/validate-mcp-trace.py` with `--self-test` (V2
  tempdir-isolated): scans the last 50 trace lines against required
  keys; rejects malformed JSON / missing keys / non-numeric duration_ms
- updated `mcp/cursor-state-bridge/fixtures/trace-schema.json` from
  Phase 1 placeholder to the canonical event schema
- shipped `docs/mcp-auth.md` with the exact framing strings
  ("defense-in-depth only", "does NOT protect against parent-process
  compromise") and the threat-model section
- extended `scripts/smoke-mcp-cursor-state-bridge.sh` `--auth` mode to
  verify default-OFF behaviour, plus new `--auth-enforced` mode that
  asserts the missing-token rejection and matching-token acceptance

ACs evidenced: AC-601..AC-607.  The full plan (AC-101..AC-607) is now
fully green; `validate-prd-ac-mapping.py` confirms all 40 plan AC IDs
have rows in `docs/PRD.yaml#mcp_acceptance_criteria`.

### MCP layer Phase 5 — hook read-only AST scanner + shared-lock enforcement

- shipped `scripts/validate-hook-readonly.py` (stdlib only) with three modes:
  - default: AST-walks every `.cursor/hooks/*.py` (excluding `_trace.py`),
    flags any write call (`write_text`, `write_bytes`, `open`, `json.dump`)
    whose argument is a string literal pointing at
    `.cursor/state/workflow-state*.json`; current 14 hook files clean
  - `--check-shared-lock`: imports the workflow-state library, asserts
    `_locking` resolves to `.cursor/state/_locking.py`, asserts no
    `.cursor/state/*.py` imports from `mcp/`, asserts the bridge does
    not ship a duplicate `_locking.py` (V1 contract)
  - `--self-test`: seeds a synthetic offender hook + a synthetic
    `_trace.py`-style hook inside `tempfile.TemporaryDirectory` (V2
    isolation), confirms the offender is detected and the trace path is
    not, never mutates the working tree
- chained `validate-hook-readonly.py` and the `--check-shared-lock` mode
  into `scripts/verify-backbone.sh`; added it to the required-file
  arrays in `verify-backbone.sh` and `validate-surface-visibility.sh`

ACs evidenced: AC-501..AC-505.

### MCP layer Phase 4 — agent + skill rewiring (bridge as sole agent-callable writer)

- rewrote `.cursor/agents/orchestrator.md` so the entry-point agent
  invokes the `cursor-state-bridge` MCP tools (`state_init`,
  `state_set_phase`, `state_update_acceptance_criterion`,
  `state_record_failure`, `state_history_append`, `state_read`) instead
  of shelling out to a state writer CLI; clarified that hooks read,
  bridge writes, and shelling out from agent prompts or skills is not
  allowed
- updated `skills/phase-controller/SKILL.md` to point at the bridge
  tools for state writes; the read-only validator
  `scripts/validate-workflow-state.py` remains agent-callable
- updated `docs/orchestration.md` Writer table to distinguish the
  agent-callable bridge from the developer-only CLI shim; documented
  agent-callable typical write points and developer-only equivalents
- AC-401 grep gate now returns zero writer-CLI references across
  `.cursor/agents/`, `skills/`, `rules/`; developer-facing docs may
  still reference the CLI

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
