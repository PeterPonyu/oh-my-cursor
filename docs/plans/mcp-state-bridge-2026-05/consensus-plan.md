# Plan v2 — Narrow stdio MCP server `cursor-state-bridge` for `.cursor/state/workflow-state.json`

Status: ralplan consensus, deliberate mode, iteration 2 (post-Critic ITERATE).
Workspace: `/home/zeyufu/Desktop/oh-my-cursor`.
Architecture (locked): Option A — single narrow stdio MCP server `cursor-state-bridge` under `mcp/cursor-state-bridge/`, six state-IO tools, sole agent-callable writer of `.cursor/state/workflow-state.json`. CLI surface stays as a thin shim around a shared library API (R6 + B12).

---

## Section 1 — RALPLAN-DR summary v2

### 1.1 Principles (5)

| # | Principle | Why it binds this plan |
|---|---|---|
| P1 | One writer per state file. | Two writers means corrupt history[] under concurrency; eliminating that race is the whole point of this plan. |
| P2 | Schema is the contract; tools are thin. | The bridge MUST NOT widen or tighten `workflow-state.schema.json`; it serializes what callers send. |
| P3 | Public files speak repo-native; legacy short names live in private notes only. | `validate-public-language.py` blocks the legacy short names in `AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/**`, `rules/**`, `skills/**`, `.cursor/rules/**`. |
| P4 | Default install is unchanged; new MCP surface ships gated. | `install-local-plugin.sh` default rsync filter excludes `mcp/`; the new `--with-mcp` flag is opt-in. |
| P5 | Defense-in-depth, not perimeter. | Token auth and jail-roots reduce blast radius; they do NOT defeat parent-process compromise. Documented honestly. |

### 1.2 Decision drivers (top 3, unchanged from v1)

| # | Driver | Concrete signal |
|---|---|---|
| D1 | Eliminate the two-writer race on `.cursor/state/workflow-state.json`. | `history[]` corruption under concurrent writes; no current lock. |
| D2 | Keep the public surface clean and the install footprint minimal. | `validate-public-language.py`, `validate-plugin-structure.sh` allowlist. |
| D3 | Stay reviewable in one PR pass: <= ~700 LoC delta in PR1, no architecture rewrite. | First-PR scope (Phase 1 only). |

### 1.3 Options considered

| Option | Shape | Verdict |
|---|---|---|
| A. Narrow stdio MCP server `cursor-state-bridge`, sole writer, six tools. | One repo, one process, one lock, one schema. | CHOSEN. |
| B. In-process Python library only (no MCP). | Library import inside agents. | INVALID — Cursor agents call MCP tools, not arbitrary Python. |
| C. Wide MCP server bundling state IO + plan IO + agent IO. | Multi-purpose. | INVALID — violates P5 minimum-blast-radius and inflates PR1. |
| D. HTTP daemon. | Long-running TCP server. | INVALID — adds network surface, needs supervision, breaks `cursor-agent -p` deterministic exit. |

### 1.4 Pre-mortem (4 scenarios, each with leading indicator + mitigation)

| # | Failure scenario | Leading indicator | Mitigation |
|---|---|---|---|
| PM1 | A second writer (CLI shim invoked in parallel with bridge) corrupts `history[]`. | `history[]` length grows by >1 per writer call; `validate-workflow-state.py --check-history-monotonic` fails in CI. | R6 library refactor (one shared implementation), R3 lock shim `mcp/cursor-state-bridge/_locking.py` shipped Phase 2, AC-208 concurrent-writers test. |
| PM2 | `.cursor/mcp.json` accidentally committed by a contributor. | `git status` shows `.cursor/mcp.json` as a tracked file. | AC-107 validator rejects tracked `.cursor/mcp.json`; `.gitignore` already excludes it; AC-110 confirms `.cursor/mcp.example.json` (the only allowed sibling) passes. |
| PM3 | Bridge writes outside its three jail roots (`.cursor/state/`, `docs/plans/<task-id>/`, `.omcs/`). | Bridge JSONL trace shows a write target whose `os.path.realpath` is not under any jail root. | AC-209 `--jail-escape` smoke; jail roots documented in `mcp/cursor-state-bridge/README.md` and `docs/state-contract.md`. |
| PM4 | `OH_MY_CURSOR_MCP_TOKEN` leaks via `ps`/`/proc` in CI/staging. | Token visible in process listing or environment dumps in any non-developer environment. | `docs/mcp-auth.md` documents defense-in-depth framing (R5); recommend Cursor's secret-store env injection; AC-606 asserts default is OFF (no token configured). |

### 1.5 Test plan (per-layer, deliberate-mode)

| Layer | Concrete artifacts |
|---|---|
| Unit | `mcp/cursor-state-bridge/tests/test_state_io_read.py`, `tests/test_state_io_write.py`, `tests/test_jail.py`, `tests/test_library_api.py`, `tests/test_locking_concurrent.py` (POSIX-only marker), `tests/test_rpc.py`. |
| Integration | `scripts/smoke-mcp-cursor-state-bridge.sh` modes: `--full`, `--jail-escape`, `--from-example`, `--auth`. Env-gated by `RUN_MCP_BRIDGE_SMOKE=1` (B7). |
| e2e (cursor-agent stream-json) | `scripts/smoke-cursor-agent.sh --bridge-e2e`, env-gated by `RUN_MCP_BRIDGE_E2E=1`. Calls `state_init` -> `state_set_phase` -> `state_update_acceptance_criterion` -> `state_history_append`; diffs against `.omcs/mcp-e2e.expected.json`. |
| e2e (tmux interactive) | `scripts/smoke-cursor-agent.sh --bridge-tmux`, env-gated. Drives the same four calls via tmux send-keys against an interactive cursor-agent session. |
| Observability | `scripts/validate-mcp-trace.py` checks last 50 trace lines vs `mcp/cursor-state-bridge/fixtures/trace-schema.json`. Rotation: 10 MiB cap, FIFO eviction, documented in `mcp/cursor-state-bridge/README.md`. |

### 1.6 Boundary truth (B6)

| Surface | Status |
|---|---|
| `mcp/cursor-state-bridge/**` | repo-owned (added in `docs/confirmed-surfaces.md`). |
| `.cursor/state/workflow-state.json` | runtime (unchanged). |
| `.cursor/mcp.example.json` | repo-owned (canonical fixture). |
| `.cursor/mcp.json` | gitignored, never tracked, validator-rejected. |
| `.omcs/` | runtime workspace-private trace target only — NOT a `repo-owned` surface; documented under "Local scratch-state policy" in `docs/state-contract.md`. |

---

## Section 2 — Phased roadmap v2 (six phases)

Every AC has an `evidence` field that is a runnable command or a checked-in artifact path. Smoke scripts are CI-runnable in dry / static mode and only invoke the bridge runtime when their `RUN_*` gate is set.

### Phase 1 — MCP server skeleton + install gating

**Objective.** Land the bridge directory, JSON-RPC stub, structure validator, and the gated install path. No state writes yet. PR1 ends here.

**Deliverables (explicit paths).**
- `mcp/cursor-state-bridge/__init__.py`
- `mcp/cursor-state-bridge/__main__.py` (entrypoint: `python3 -m cursor_state_bridge --workspace <path>`)
- `mcp/cursor-state-bridge/server.py` (stdio JSON-RPC 2.0 loop, `tools/list` + `tools/call` skeletons)
- `mcp/cursor-state-bridge/jail.py` (resolves and enforces three jail roots)
- `mcp/cursor-state-bridge/README.md` (install, env vars, jail roots, trace rotation policy)
- `mcp/cursor-state-bridge/fixtures/mcp.example.canonical.json`
- `mcp/cursor-state-bridge/fixtures/trace-schema.json` (placeholder; populated in Phase 6)
- `.cursor/mcp.example.json` (byte-equal to the canonical fixture)
- `scripts/validate-mcp-server-structure.py` (allowlist + presence checks for `mcp/cursor-state-bridge/`)
- `scripts/smoke-mcp-cursor-state-bridge.sh` (modes `--full`, `--jail-escape`, `--from-example`, `--auth`; env-gated by `RUN_MCP_BRIDGE_SMOKE=1`; NOT inheriting `smoke-cursor-agent.sh`'s retry harness because the bridge is deterministic non-network — B10)
- `scripts/install-local-plugin.sh` patch: new `--with-mcp` flag (default OFF) that adds `--include='/mcp/***'` to the rsync include list
- `scripts/check-local-plugin-install.sh` patch: accept `--with-mcp`, assert the copied tree contains `mcp/cursor-state-bridge/server.py` only when the flag is set
- `scripts/validate-plugin-structure.sh` patch: allowlist `.cursor/mcp.example.json`; reject tracked `.cursor/mcp.json`
- `docs/plans/mcp-state-bridge-2026-05/expected-rename-references.txt` (B2 fixture; idempotent because we keep the writer filename — see Phase 2 note)
- `scripts/validate-rename-references.py` (B2; runs as a no-op idempotent pass in PR1)

**Acceptance criteria (NUMBERED).**

| AC | Statement | Evidence |
|---|---|---|
| AC-101 | `mcp/cursor-state-bridge/` exists with the deliverables above. | `python3 scripts/validate-mcp-server-structure.py` exits 0. |
| AC-102 | The server speaks JSON-RPC 2.0 over stdio: `tools/list` returns the six tool names defined in Phase 3 with valid JSONSchema parameter blocks. | `RUN_MCP_BRIDGE_SMOKE=1 scripts/smoke-mcp-cursor-state-bridge.sh --full` exits 0. |
| AC-103 | Jail roots are exactly three: `<workspace>/.cursor/state/`, `<workspace>/docs/plans/<task-id>/`, `<workspace>/.omcs/`. Any other write target rejected with JSON-RPC error `-32602`. | `pytest mcp/cursor-state-bridge/tests/test_jail.py -q` exits 0. |
| AC-104 | `validate-public-language.py` passes against the new public files (`mcp/cursor-state-bridge/README.md`, any new entries in `docs/**` or `rules/**`). | `python3 scripts/validate-public-language.py` exits 0. |
| AC-105 | Default install path is unchanged: without `--with-mcp`, the installed plugin tree does NOT contain `mcp/`. | `scripts/check-local-plugin-install.sh` exits 0 AND `! find <installed-target> -type d -name mcp` (asserted by the check script). |
| AC-106 | With `--with-mcp`, the installed plugin tree DOES contain `mcp/cursor-state-bridge/server.py`. | `scripts/check-local-plugin-install.sh --with-mcp` exits 0 and prints `OK: mcp/cursor-state-bridge/server.py present`. |
| AC-107 | `validate-plugin-structure.sh` rejects a tracked `.cursor/mcp.json`. Self-test uses an isolated `tempfile.TemporaryDirectory` and MUST NOT mutate the working tree; cleanup is guaranteed by `finally:` or context manager (V2). | Validator's temp-fixture sub-test drops `.cursor/mcp.json` inside the tempdir, runs the validator, asserts non-zero exit and the error string `tracked .cursor/mcp.json is forbidden`. Evidence: `scripts/validate-plugin-structure.sh --self-test` exits 0 and leaves the working tree unchanged (`git status --porcelain` empty). |
| AC-108 | `.cursor/mcp.example.json` is byte-equal to `mcp/cursor-state-bridge/fixtures/mcp.example.canonical.json` and matches the canonical shape. | `python3 -c "import json,pathlib; assert json.loads(pathlib.Path('.cursor/mcp.example.json').read_text())==json.loads(pathlib.Path('mcp/cursor-state-bridge/fixtures/mcp.example.canonical.json').read_text())"` exits 0. |
| AC-109 | Without `RUN_MCP_BRIDGE_SMOKE=1`, `smoke-mcp-cursor-state-bridge.sh` exits 0 immediately with a "bounded: smoke gated by RUN_MCP_BRIDGE_SMOKE=1" message and never spawns the bridge. | `unset RUN_MCP_BRIDGE_SMOKE; scripts/smoke-mcp-cursor-state-bridge.sh --full` exits 0 in <1s with the bounded message in stdout. |
| AC-110 | `validate-plugin-structure.sh` allowlist passes when only `.cursor/mcp.example.json` is present and continues to fail when a tracked `.cursor/mcp.json` is present (ties AC-107). Self-test uses an isolated `tempfile.TemporaryDirectory` and MUST NOT mutate the working tree (V2). | `scripts/validate-plugin-structure.sh` exits 0 on baseline; `scripts/validate-plugin-structure.sh --self-test` covers both presence cases inside a tempdir; `git status --porcelain` empty after run. |

**Validators added/extended.** `validate-mcp-server-structure.py` (new); `validate-plugin-structure.sh` (extended for `.cursor/mcp.example.json` allow + `.cursor/mcp.json` reject + `--self-test`); `check-local-plugin-install.sh` (extended for `--with-mcp`); `validate-rename-references.py` (new, no-op idempotent in PR1).

**Risks (>=2).** R-P1a: rsync include order subtleties cause `--with-mcp` to silently miss subdirs — mitigated by AC-106. R-P1b: `.cursor/mcp.example.json` drifts from canonical fixture — mitigated by AC-108 byte-equality.

**Rollback.** Revert PR1; default install path is unchanged so no runtime impact.

---

### Phase 2 — Library refactor + locking shim + state-IO module

**Objective.** Make `.cursor/state/workflow-state.py` the single shared implementation. Bridge imports it; CLI shim calls it. Eliminate the two-writer window in code, not just convention (R6 + B3 + B12). Note on rename: we KEEP the filename `workflow-state.py` and refactor it in place; B2's grep gate therefore runs as a no-op idempotent check. If a future PR renames the file, the same gate becomes load-bearing.

**Deliverables.**
- `.cursor/state/workflow-state.py` refactored to expose typed library API: `init_state(...)`, `set_state(...)`, `update_acceptance_criterion(...)`, `record_failure(...)`, `append_history(...)`, `read_state(...)`. Existing `cmd_*` argparse handlers become thin shims around the library API. Returns the new state dict (in-memory representation post-write).
- `mcp/cursor-state-bridge/state_io.py` imports the library API from `.cursor/state/workflow-state.py`. Zero `subprocess` calls.
- `.cursor/state/_locking.py` POSIX `fcntl`-based advisory lock context manager (located in the always-shipped `.cursor/state/` tree, NOT under `mcp/`, so the CLI shim does not import across the `--with-mcp` boundary and default-install users avoid an `ImportError`); cross-platform replacement deferred to F2. (V1 architect delta)
- `mcp/cursor-state-bridge/tests/test_state_io_read.py`, `test_state_io_write.py`, `test_library_api.py`, `test_locking_concurrent.py` (POSIX-only marker), `test_jail.py`.
- `scripts/validate-workflow-state.py` extended with `--check-history-monotonic` flag (used by AC-208 and PM1 leading indicator).

**Acceptance criteria.**

| AC | Statement | Evidence |
|---|---|---|
| AC-201 | Library API exists with the six functions and matching type hints. | `python3 -c "from importlib import util; m=util.spec_from_file_location('ws','.cursor/state/workflow-state.py'); mod=util.module_from_spec(m); m.loader.exec_module(mod); [getattr(mod,fn) for fn in ('init_state','set_state','update_acceptance_criterion','record_failure','append_history','read_state')]"` exits 0. |
| AC-202 | Bridge `state_io.py` imports the library API and never calls `subprocess`. | `grep -n 'subprocess' mcp/cursor-state-bridge/state_io.py` returns zero hits (AC-207c). |
| AC-203 | CLI shim still works: `python3 .cursor/state/workflow-state.py init --task-id T1 --plan-id P1 --output <tmp>` produces a schema-valid file. | `scripts/validate-state-contract.sh` exits 0. |
| AC-204 | All writes go through one lock acquisition; CLI and bridge share it. | `pytest mcp/cursor-state-bridge/tests/test_locking_concurrent.py -q -m posix` exits 0 (AC-208 evidence). |
| AC-205 | Existing `validate-workflow-state.py` continues to pass on the example state. | `python3 scripts/validate-workflow-state.py .cursor/state/workflow-state.example.json` exits 0. |
| AC-206 | Library API unit tests cover all six entrypoints with zero `argparse.Namespace` mocks. | `pytest mcp/cursor-state-bridge/tests/test_library_api.py -q` exits 0; `grep -n 'argparse' mcp/cursor-state-bridge/tests/test_library_api.py` returns zero hits. |
| AC-207 | `_locking.py` shim ships in Phase 2 at `.cursor/state/_locking.py` (V1) and imports cleanly on POSIX. | `python3 -c "import sys; sys.path.insert(0, '.cursor/state'); from _locking import file_lock; print('ok')"` prints `ok`; AND `grep -RIn 'from mcp\\..*_locking' .cursor/state/` returns zero hits (V1 import-direction guard). |
| AC-208 | Concurrency proof: two subprocess writers calling `state_set_phase` simultaneously produce a monotonic `history[]` containing both writes with no interleaving. | `pytest mcp/cursor-state-bridge/tests/test_locking_concurrent.py -q -m posix` exits 0; the test asserts `len(history)==2` and timestamps strictly non-decreasing; `python3 scripts/validate-workflow-state.py --check-history-monotonic <tmp>` exits 0. |
| AC-209 | Jail-escape proof: bridge with a write target outside the three jail roots is rejected with JSON-RPC `-32602`. | `RUN_MCP_BRIDGE_SMOKE=1 scripts/smoke-mcp-cursor-state-bridge.sh --jail-escape` exits 0; the script asserts the response payload contains `"code": -32602`. |

**Validators added/extended.** `validate-workflow-state.py --check-history-monotonic` (new flag); `validate-rename-references.py` continues as no-op idempotent pass.

**Risks.** R-P2a: refactor accidentally changes on-disk format — mitigated by AC-205. R-P2b: POSIX-only locking blocks Windows contributors — mitigated by F2 cross-platform follow-up; documented in `mcp/cursor-state-bridge/README.md`.

**Rollback.** Revert the library refactor; CLI shim and existing argparse handlers continue to work because the refactor preserves the public CLI signatures (covered by AC-203).

---

### Phase 3 — Six tool implementations + schema parity

**Objective.** Implement the six MCP tools end-to-end with schema-faithful semantics.

**Tools.**

| Tool | Library call | Notes |
|---|---|---|
| `state_init` | `init_state(task_id, plan_id, ...)` | Idempotent on identical inputs. |
| `state_set_phase` | `set_state(phase=...)` | Appends to `history[]`. |
| `state_update_acceptance_criterion` | `update_acceptance_criterion(ac_id, status, evidence?)` | `evidence` is OPTIONAL per schema (R4 + B8). |
| `state_record_failure` | `record_failure(message, phase, ...)` | Routes through failure-router contract. |
| `state_history_append` | `append_history(event, ...)` | Single-entry append. |
| `state_read` | `read_state()` | Returns full state dict; read-only, no lock contention. |

**Acceptance criteria.**

| AC | Statement | Evidence |
|---|---|---|
| AC-301 | All six tools advertised in `tools/list` with valid JSONSchema parameter blocks; each `tools/call` round-trip succeeds against an empty workspace. | `RUN_MCP_BRIDGE_SMOKE=1 scripts/smoke-mcp-cursor-state-bridge.sh --full` exits 0 and stdout contains `tools=6`. |
| AC-302 | `state_update_acceptance_criterion` stores `evidence` verbatim WHEN PROVIDED; absent `evidence` keeps the existing value or empty string. Schema NOT tightened. | `pytest mcp/cursor-state-bridge/tests/test_state_io_write.py::test_evidence_optional -q` exits 0. |
| AC-303 | `state_record_failure` produces a `failure_log[]` entry that passes the existing failure-router contract (smoke parity). | `scripts/smoke-cursor-workflow-artifacts.sh` exits 0. |
| AC-304 | `state_read` returns a dict that round-trips through `validate-workflow-state.py` with no diff. | `python3 scripts/validate-workflow-state.py <state-file-after-state_read>` exits 0; `diff <state_read_dump> <state-file>` returns empty. |
| AC-305 | All six tools reject any path outside the three jail roots with `-32602`. | `pytest mcp/cursor-state-bridge/tests/test_jail.py::test_all_six_tools_reject_escape -q` exits 0. |

**Validators added/extended.** Reuses `validate-workflow-state.py`, `smoke-cursor-workflow-artifacts.sh`.

**Risks.** R-P3a: schema/tool drift if someone tightens evidence to required — mitigated by AC-302. R-P3b: `state_read` race with concurrent writer — mitigated by lock-free read returning last-committed state (atomic file replace).

**Rollback.** Disable tools via `tools/list` returning the empty set; bridge still answers `tools/list` so the gate is local to Phase 3.

---

### Phase 4 — Hook + agent rewiring (read-only stays, writers go through bridge)

**Objective.** Hooks remain read-only on `.cursor/state/workflow-state.json`. Agents that write the state now call the bridge.

**Deliverables.**
- `.cursor/agents/orchestrator.md` updated: writer instructions reference the six bridge tools; CLI invocation removed from agent-callable surface (kept as developer-facing only).
- `skills/phase-controller/SKILL.md` updated: writer guidance routes through the bridge.
- `docs/orchestration.md` updated to reflect bridge-as-sole-agent-writer.
- No hook code changes; existing read-only hooks are unaffected.

**Acceptance criteria.**

| AC | Statement | Evidence |
|---|---|---|
| AC-401 | No agent-facing prompt or skill instructs an agent to invoke `python3 .cursor/state/workflow-state.py ...` directly. | `grep -RIn 'workflow-state.py' .cursor/agents/ skills/ rules/` returns zero hits in agent-callable surfaces (developer-facing docs may still reference it). Captured in `validate-rename-references.py` allowlist. |
| AC-402 | `validate-public-language.py` continues to pass on rewritten public docs. | `python3 scripts/validate-public-language.py` exits 0. |
| AC-403 | `verify-backbone.sh` continues to pass after the rewire. | `scripts/verify-backbone.sh` exits 0. |
| AC-404 | `validate-cursor-workflow-artifacts.py` continues to pass. | `python3 scripts/validate-cursor-workflow-artifacts.py` exits 0. |

**Validators added/extended.** `validate-rename-references.py` allowlist updated to distinguish agent-facing from developer-facing references.

**Risks.** R-P4a: an agent prompt missed in rewrite still invokes the CLI — mitigated by AC-401 grep gate. R-P4b: skill/rule doc drift — mitigated by AC-402 + verify-backbone.

**Rollback.** Revert the agent/skill doc edits; bridge continues to function but agents fall back to the CLI shim (still safe under R6).

---

### Phase 5 — Hook read-only enforcement (AST scan)

**Objective.** Mechanically enforce that hooks never write `.cursor/state/workflow-state.json`.

**Deliverables.**
- `scripts/validate-hook-readonly.py` (new) AST-scans `.cursor/hooks/*.py` for any direct write to `.cursor/state/workflow-state.json` (string match on the path AND `open(...,'w')` / `open(...,'a')` / `Path.write_text` / `json.dump` against that path AST node). Allowlist: `_trace.py` writes to `.omcs/` are explicitly permitted.
- The same validator asserts `.cursor/state/workflow-state.py`, when used as a CLI, ultimately serializes through the same lock as the bridge (verified by importing the library API and asserting `_locking.file_lock` is invoked in the write path; smoke evidence supplied by AC-208).

**Acceptance criteria.**

| AC | Statement | Evidence |
|---|---|---|
| AC-501 | No hook writes `.cursor/state/workflow-state.json` directly; only `_trace.py` writes to `.omcs/`. | `python3 scripts/validate-hook-readonly.py` exits 0; AST-scan output lists zero offenders. |
| AC-502 | The CLI shim and the bridge share the same lock (single-implementation guarantee); import direction is `mcp/cursor-state-bridge/state_io.py → .cursor/state/_locking.py`, never reverse (V1). | `python3 scripts/validate-hook-readonly.py --check-shared-lock` exits 0; asserts both code paths reach the same `_locking.file_lock` callable identity AND no module under `.cursor/state/` imports anything from `mcp/`. |
| AC-503 | `validate-hook-readonly.py` is wired into `verify-backbone.sh`. | `scripts/verify-backbone.sh` exits 0 and stdout contains `validate-hook-readonly.py: OK`. |
| AC-504 | A synthetic offender (temp file under `.cursor/hooks/_evil.py` calling `Path('.cursor/state/workflow-state.json').write_text(...)`) is detected. Self-test uses an isolated `tempfile.TemporaryDirectory` and MUST NOT mutate the working tree; cleanup is guaranteed by `finally:` or context manager (V2). | `python3 scripts/validate-hook-readonly.py --self-test` exits 0; the self-test seeds the synthetic offender inside the tempdir and removes it; `git status --porcelain` empty after run. |
| AC-505 | `_trace.py` allowlist works: a write to `.omcs/trace.jsonl` does NOT trip the validator. Self-test uses an isolated `tempfile.TemporaryDirectory` and MUST NOT mutate the working tree (V2). | Same `--self-test` run covers the allowlist case and asserts pass; tempdir teardown verified. |

**Validators added/extended.** `validate-hook-readonly.py` (new) wired into `verify-backbone.sh`.

**Risks.** R-P5a: AST scan misses dynamic imports — mitigated by string-path search as a second layer. R-P5b: false positives on benign string literals — mitigated by AST-node-aware match (the path must appear as the first arg to a write call).

**Rollback.** Remove the validator wiring from `verify-backbone.sh`; AST scan is a static check with no runtime cost.

---

### Phase 6 — Auth, observability, docs

**Objective.** Defense-in-depth auth, structured trace, finalized docs.

**Deliverables.**
- `mcp/cursor-state-bridge/auth.py`: optional `OH_MY_CURSOR_MCP_TOKEN` check; default is OFF (no token required).
- `mcp/cursor-state-bridge/_trace.py`: JSONL emitter writing to `.omcs/cursor-state-bridge/trace.jsonl` (V3 pinned distinct from `.omcs/hook-trace.log` to avoid writer collision); rotation 10 MiB cap, FIFO eviction.
- `mcp/cursor-state-bridge/fixtures/trace-schema.json`: required keys `{"ts","tool","phase","result","duration_ms"}`, optional `{"task_id","error_class","args_digest"}`.
- `scripts/validate-mcp-trace.py` (new): validates last 50 trace lines against the schema; rejects malformed lines.
- `docs/mcp-auth.md` (new): exact framing — "`OH_MY_CURSOR_MCP_TOKEN` is defense-in-depth only and does NOT protect against parent-process compromise"; recommends Cursor secret-store env injection.
- `docs/state-contract.md` patch: "Local scratch-state policy" section documents `.omcs/` as a permitted runtime write target for the bridge — workspace-private, gitignored, NOT a checked-in `repo-owned` artifact.
- `docs/confirmed-surfaces.md` patch: add `mcp/cursor-state-bridge/**` row as `repo-owned`. Do NOT add a row for `.omcs/`.
- `mcp/cursor-state-bridge/README.md`: trace rotation policy (writes to `.omcs/cursor-state-bridge/trace.jsonl`; explicitly non-colliding with hook trace at `.omcs/hook-trace.log` per V3), jail roots, env vars, install instructions.
- `CHANGELOG.md` entry.

**Acceptance criteria.**

| AC | Statement | Evidence |
|---|---|---|
| AC-601 | Last 50 trace lines after a smoke run conform to `fixtures/trace-schema.json`; bridge writes to `.omcs/cursor-state-bridge/trace.jsonl` (V3, NOT `.omcs/hook-trace.log`). | `RUN_MCP_BRIDGE_SMOKE=1 scripts/smoke-mcp-cursor-state-bridge.sh --full && python3 scripts/validate-mcp-trace.py --tail 50 --path .omcs/cursor-state-bridge/trace.jsonl` exits 0; `[[ -f .omcs/cursor-state-bridge/trace.jsonl ]]` is true; `[[ ! $(grep -l 'cursor-state-bridge' .omcs/hook-trace.log 2>/dev/null) ]]` confirms non-collision. |
| AC-602 | Trace rotation: writing >10 MiB causes FIFO eviction; total on-disk size stays <=10 MiB. | `pytest mcp/cursor-state-bridge/tests/test_trace_rotation.py -q` exits 0. |
| AC-603 | `docs/mcp-auth.md` contains the exact framing string "defense-in-depth only" and "does NOT protect against parent-process compromise". | `grep -n 'defense-in-depth only' docs/mcp-auth.md && grep -n 'does NOT protect against parent-process compromise' docs/mcp-auth.md` both exit 0. |
| AC-604 | `docs/state-contract.md` "Local scratch-state policy" section documents `.omcs/` as workspace-private, gitignored, runtime-only. | `grep -n 'Local scratch-state policy' docs/state-contract.md && grep -n '.omcs/' docs/state-contract.md` both exit 0. |
| AC-605 | `docs/confirmed-surfaces.md` lists `mcp/cursor-state-bridge/**` as `repo-owned` and does NOT list `.omcs/` as `repo-owned`. | `grep -n 'mcp/cursor-state-bridge' docs/confirmed-surfaces.md` exits 0; `! grep -E '^\\|.*\\.omcs/.*repo-owned' docs/confirmed-surfaces.md` (asserted true). |
| AC-606 | Default auth is OFF; `OH_MY_CURSOR_MCP_TOKEN` unset MUST NOT block bridge calls. `check-default-auth.sh` continues to pass. | `unset OH_MY_CURSOR_MCP_TOKEN; RUN_MCP_BRIDGE_SMOKE=1 scripts/smoke-mcp-cursor-state-bridge.sh --auth` exits 0; `scripts/check-default-auth.sh` exits 0. |
| AC-607 | `validate-mcp-trace.py` rejects malformed lines (truncated JSON, missing required keys) via a unit test fixture. Self-test uses an isolated `tempfile.TemporaryDirectory` and MUST NOT mutate the working tree; cleanup is guaranteed by `finally:` or context manager (V2). | `python3 scripts/validate-mcp-trace.py --self-test` exits 0; the self-test seeds malformed lines inside the tempdir and asserts non-zero exit on those, zero on a clean fixture; `git status --porcelain` empty after run. |

**Validators added/extended.** `validate-mcp-trace.py` (new); `check-default-auth.sh` continues unchanged; `validate-public-language.py` runs against new docs.

**Risks.** R-P6a: trace rotation race under concurrent writes — mitigated by single-process write path. R-P6b: token leak via `ps` — documented in `docs/mcp-auth.md`; mitigation is operational (Cursor secret-store).

**Rollback.** Disable trace emission via env flag; delete `docs/mcp-auth.md`; revert `docs/confirmed-surfaces.md` row.

---

## Section 3 — Out of scope

| Item | Reason |
|---|---|
| Plan IO MCP server (separate bridge for `docs/plans/<task-id>/`). | Out of PR1; tracked as F4 follow-up. |
| Cross-platform locking (Windows). | F2; POSIX-only in v2. |
| Promoting `.omcs/` to a checked-in `repo-owned` surface. | Per B6: workspace-private, gitignored, runtime-only. |
| Renaming `.cursor/state/workflow-state.py`. | Optional and deferred; B2 grep gate ships now as no-op idempotent. |
| Wider MCP server bundling agent IO + plan IO. | Violates P5; rejected option C. |
| HTTP daemon variant. | Rejected option D. |
| Migrating other agents/skills onto a shared MCP bridge for non-state assets. | F5. |

---

## Section 4 — ADR

**Decision.** Ship a narrow stdio MCP server `cursor-state-bridge` under `mcp/cursor-state-bridge/` as the sole agent-callable writer of `.cursor/state/workflow-state.json`, exposing six state-IO tools that share one lock with a refactored `.cursor/state/workflow-state.py` library API. Default install excludes `mcp/`; opt-in via `--with-mcp`.

**Decision drivers.** D1 eliminate two-writer race; D2 keep public surface clean and install footprint minimal; D3 reviewable in one PR pass.

**Alternatives considered.**
- B (in-process library only) — invalid: Cursor agents call MCP tools, not arbitrary Python.
- C (wide MCP server) — invalid: violates P5 and bloats PR1.
- D (HTTP daemon) — invalid: adds network surface and supervision; breaks `cursor-agent -p` deterministic exit.

**Why chosen.** Option A is the only candidate that (1) aligns with Cursor's MCP transport, (2) lets us collapse to a single shared implementation between CLI and bridge (R6), and (3) fits a one-PR scope for the foundation phase.

**Consequences.**
- The two-writer window is eliminated by code, not convention: the CLI shim and the bridge call the same library API behind one `file_lock`. There is no deprecation window for the CLI surface — it stays as a developer-facing thin shim.
- Default install is unchanged. The opt-in `--with-mcp` flag prevents footprint growth for users who don't need the bridge.
- POSIX-only locking is acceptable for v2; Windows support is F2.
- `.omcs/` remains workspace-private, gitignored, runtime-only — never a `repo-owned` surface.
- `docs/mcp-auth.md` honestly documents that token auth is defense-in-depth, not a perimeter.

**Follow-ups.**

| ID | Item | Trigger |
|---|---|---|
| F1 | History cap / compaction policy on `.cursor/state/workflow-state.json`. | When `history[]` length exceeds operator-chosen threshold. |
| F2 | Cross-platform locking (`portalocker` or equivalent). | When a Windows contributor needs the bridge. |
| F3 | Feature decision: should the CLI surface remain user-facing or become bridge-only? | After Phase 6 ships and we have 30 days of trace data on CLI usage. |
| F4 | Plan-bridge: a sibling MCP server for `docs/plans/<task-id>/`. | When plan IO needs the same single-writer guarantee. |
| F5 | Rewire remaining agent prompts and skills to reference the bridge as the canonical writer. | After Phase 4 lands, in a follow-up PR. |

---

## Section 5 — First PR (Phase 1 only)

**Branch.** `feat/mcp-cursor-state-bridge-skeleton`.

**Files added/modified.**

| Path | Change |
|---|---|
| `mcp/cursor-state-bridge/__init__.py` | NEW |
| `mcp/cursor-state-bridge/__main__.py` | NEW |
| `mcp/cursor-state-bridge/server.py` | NEW (JSON-RPC stub + `tools/list` skeleton with six names) |
| `mcp/cursor-state-bridge/jail.py` | NEW |
| `mcp/cursor-state-bridge/README.md` | NEW |
| `mcp/cursor-state-bridge/fixtures/mcp.example.canonical.json` | NEW |
| `mcp/cursor-state-bridge/fixtures/trace-schema.json` | NEW (placeholder; populated in Phase 6) |
| `.cursor/mcp.example.json` | NEW (byte-equal to canonical fixture) |
| `scripts/install-local-plugin.sh` | MODIFIED (`--with-mcp` flag adds `--include='/mcp/***'` to rsync include list) |
| `scripts/check-local-plugin-install.sh` | MODIFIED (accept `--with-mcp`; assert `mcp/cursor-state-bridge/server.py` present only when set; assert absent otherwise) |
| `scripts/validate-plugin-structure.sh` | MODIFIED (allowlist `.cursor/mcp.example.json`; reject tracked `.cursor/mcp.json`; add `--self-test`) |
| `scripts/validate-mcp-server-structure.py` | NEW |
| `scripts/smoke-mcp-cursor-state-bridge.sh` | NEW (modes `--full`, `--jail-escape`, `--from-example`, `--auth`; gated by `RUN_MCP_BRIDGE_SMOKE=1`; no retry harness — B10) |
| `scripts/validate-rename-references.py` | NEW (no-op idempotent in PR1) |
| `docs/plans/mcp-state-bridge-2026-05/expected-rename-references.txt` | NEW (B2 fixture) |

**PR acceptance criteria.** AC-101..AC-110 (Phase 1 only).

**Validators run by the PR.**

| Validator | Why |
|---|---|
| `python3 scripts/validate-mcp-server-structure.py` | AC-101 |
| `RUN_MCP_BRIDGE_SMOKE=1 scripts/smoke-mcp-cursor-state-bridge.sh --full --jail-escape --from-example --auth` | AC-102, AC-103 (parts), AC-109 (gated mode) |
| `unset RUN_MCP_BRIDGE_SMOKE; scripts/smoke-mcp-cursor-state-bridge.sh --full` | AC-109 (bounded mode) |
| `python3 scripts/validate-public-language.py` | AC-104 |
| `python3 scripts/validate-cursor-workflow-artifacts.py` | regression baseline |
| `scripts/validate-plugin-structure.sh && scripts/validate-plugin-structure.sh --self-test` | AC-107, AC-110 |
| `scripts/check-local-plugin-install.sh && scripts/check-local-plugin-install.sh --with-mcp` | AC-105, AC-106 |
| `scripts/check-default-auth.sh` | AC-606 baseline (also re-run in Phase 6) |
| `scripts/verify-backbone.sh` | regression baseline |
| `python3 scripts/validate-rename-references.py` | B2 idempotent no-op pass |
| `python3 -c "import json,pathlib; assert json.loads(pathlib.Path('.cursor/mcp.example.json').read_text())==json.loads(pathlib.Path('mcp/cursor-state-bridge/fixtures/mcp.example.canonical.json').read_text())"` | AC-108 |

**PR title.** `feat(mcp): add cursor-state-bridge skeleton (Phase 1)`.

**PR body sketch.**
- Adds the `mcp/cursor-state-bridge/` skeleton, JSON-RPC stub, jail roots, structure validator, and the gated install path.
- Default install is unchanged; opt-in via `--with-mcp`.
- No state writes yet; library refactor + locking shim land in Phase 2.
- Phase 1 ACs: AC-101..AC-110, all passing.

---

## Final checklist (planner self-audit)

- [x] Architect R1..R6 applied (Phase 5 AC-501 + AC-502; jail roots = 3 with `.omcs/` documented under state-contract; locking shim shipped Phase 2; AC-302 relaxed to optional `evidence`; `docs/mcp-auth.md` framing exact; CLI refactored as thin shim around shared library API).
- [x] Critic B1..B12 applied (rsync `--with-mcp` flag default OFF; rename-references fixture + idempotent gate; library API + zero-subprocess assertion + concurrency proof; jail-escape proof; canonical mcp.example fixture byte-equality; smoke gated by `RUN_MCP_BRIDGE_SMOKE=1` with bounded fast-path; trace schema + validator).
- [x] Pre-mortem expanded to 4 scenarios with leading indicators.
- [x] Test plan stratified into unit / integration / e2e (stream-json + tmux) / observability with concrete artifact paths.
- [x] Every AC has a runnable evidence command or checked-in artifact.
- [x] Smokes are CI-runnable in bounded mode without paid runtime.
- [x] Boundary truth: `.omcs/` NOT promoted to `repo-owned`.
- [x] ADR consequences updated to reflect R6 elimination of two-writer window.
- [x] First-PR scope = Phase 1 only.
- [x] V1 (lock primitive at `.cursor/state/_locking.py`, NOT under `mcp/`) applied: Phase 2 deliverable line + AC-207 + AC-502.
- [x] V2 (self-test tempdir isolation phrasing) applied: AC-107, AC-110, AC-504, AC-505, AC-607.
- [x] V3 (bridge trace path pinned to `.omcs/cursor-state-bridge/trace.jsonl`) applied: Phase 6 deliverable + README + AC-601.

---

## Consensus signoff

- **Iteration 1 (planner → architect → critic)**: Architect `architecturally-sound-with-revisions` (R1–R6). Critic `ITERATE` (B1–B12 + DM-1/2 rigor).
- **Iteration 2 (planner v2 → architect v2 → critic v2)**: Architect `architecturally-sound-with-revisions` (V1–V3 mechanical pinning only). Critic **APPROVE**.
- **Status**: FINAL. No iteration 3.
- **Mode used**: deliberate (auth/security boundary + public API surface auto-trigger). No `--interactive` flag, so workflow ends here without execution invocation.

---

## Phase 7 — bounded history retention (post-consensus follow-up F1)

Shipped after the original 6 phases as a small, scope-bounded extension
that closes follow-up F1 from Section 4 of the ADR.  AC IDs
**AC-701..AC-705** are mapped in `docs/PRD.yaml#mcp_acceptance_criteria`
and evidenced by `mcp/cursor-state-bridge/tests/test_history_compaction.py`.

| AC | Statement | Evidence |
|---|---|---|
| AC-701 | A synthetic state with 1500 history entries gets compacted to 1000 after the next write. | `pytest mcp/cursor-state-bridge/tests/test_history_compaction.py::TestHistoryCompaction::test_compacts_1500_to_default_cap -q` |
| AC-702 | FIFO eviction: the oldest entries are dropped first. | `pytest …::test_fifo_eviction_drops_oldest -q` |
| AC-703 | Post-compaction `history[].at` remains monotonic non-decreasing. | `pytest …::test_post_compaction_timestamps_monotonic -q`; `python3 scripts/validate-workflow-state.py --check-history-cap 1000 <path>` exits 0. |
| AC-704 | `history_cap=0` opts out of compaction. | `pytest …::test_cap_zero_disables_compaction -q` |
| AC-705 | The most-recent entry is preserved verbatim. | `pytest …::test_most_recent_entry_preserved -q` |

**Discipline preserved**: workflow-state schema unchanged (R4); cap is a
per-call knob, not a schema field.  POSIX `file_lock` from
`.cursor/state/_locking.py` still serialises every write.  Default
install footprint unchanged.

---

## Phase 8 — agent-callable surface contract enforcement (post-consensus follow-up F5)

Mechanically locks down what was already a clean status quo.  AC IDs
**AC-801..AC-805** are mapped in `docs/PRD.yaml#mcp_acceptance_criteria`
and evidenced by `scripts/validate-agent-bridge-contract.py`.

| AC | Statement | Evidence |
|---|---|---|
| AC-801 | Default scan exits 0 across the 22 agent-callable surfaces under `.cursor/agents/`, `skills/`, `rules/`, `.cursor/rules/`. | `python3 scripts/validate-agent-bridge-contract.py` |
| AC-802 | `--self-test` detects writer-CLI bypass, stale archived-doc paths, and legacy short names; clean fixture passes; tempdir-isolated, never mutates the working tree. | `python3 scripts/validate-agent-bridge-contract.py --self-test`; `git status --porcelain` empty after. |
| AC-803 | A writer-CLI bypass on an agent-callable surface is rejected with a precise file:line cite. | self-test `bypass.md` synthetic offender. |
| AC-804 | Stale `docs/refinement-priority-map.md` / `docs/plugin-boundary-review.md` / `docs/fallback-policy.md` references are detected (must use `docs/archive/`). | self-test `stale.md` synthetic offender. |
| AC-805 | Validator chained into `verify-backbone.sh` and the required-file arrays in `verify-backbone.sh` + `validate-surface-visibility.sh`. | `grep validate-agent-bridge-contract scripts/verify-backbone.sh` returns non-empty. |

**Discipline preserved**: no agent-callable .md / .mdc was modified by
this phase — the contract enforcement targets the no-violation status
quo that landed in Phase 4 + the README-polish pass.
