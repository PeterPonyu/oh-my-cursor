# Cursor project hooks

This directory contains repo-owned lifecycle helpers for trusted Cursor
workspaces. The project hook manifest lives at `.cursor/hooks.json` and points
to the Python scripts in this directory. Names are short and lifecycle-style:

- `session-bootstrap.py` (event: `sessionStart`) emits a one-shot
  `additional_context` reminder of the repo claim/proof discipline and any
  reachable workflow-state document (phase, role, pending or failed
  acceptance criteria, recorded next action). Fail-open; never sets
  environment variables.
- `session-summary.py` (event: `sessionEnd`) emits a structured JSON
  observation of the session's recorded final status plus pending or failed
  acceptance criteria from any reachable workflow-state document. Purely
  observational; never enforces closure.
- `prompt-router.py` (event: `beforeSubmitPrompt`) scans the user prompt
  for repo-owned skill, agent, and phase keywords and surfaces routing
  hints plus a workflow-state summary as `additional_context`. Fail-open;
  never blocks a prompt.
- `tool-guard.py` (event: `preToolUse`) lets every tool call through with
  `permission=allow` except non-shell editing tools (Write/Edit/MultiEdit/
  NotebookEdit) targeting a file whose basename is `workflow-state.json`,
  in which case it sets `permission=ask` and recommends the writer helper.
- `state-watcher.py` (event: `postToolUse`) re-reads any edited
  `workflow-state.json` from disk and validates it against
  `.cursor/state/workflow-state.schema.json` using only the Python standard
  library, surfacing the result as `additional_context`. Read-only.
- `failure-router.py` (event: `postToolUseFailure`) emits an
  `additional_context` note that routes failures through
  `.cursor/agents/debugger.md` and recommends recording the failure type
  with the workflow-state writer. Observational; never enforces.
- `subagent-bootstrap.py` (event: `subagentStart`) always allows the
  subagent to start and adds a short `user_message` pointing at the
  matching `.cursor/agents/<role>.md` prompt when `subagent_type` matches a
  checked-in role.
- `subagent-summary.py` (event: `subagentStop`) emits an observational
  JSON summary of the recorded subagent run and never returns
  `followup_message`, so it does not consume the auto-follow-up loop budget.
- `shell-guard.py` (event: `beforeShellExecution`) inspects the proposed
  shell command. Risky patterns (force-push, `--no-verify`, `rm -rf`, hard
  reset, branch -D, checkout discard) emit a warning while keeping
  `permission=allow`. A tightly bounded severe set covers operations that
  would corrupt repo-owned state files (`.cursor/state/workflow-state*.json`)
  or the local plugin install path
  (`~/.cursor/plugins/local/oh-my-cursor`); those return `permission=ask`
  so Cursor can confirm with the user before executing.
- `shell-debrief.py` (event: `afterShellExecution`) emits an
  `additional_context` evidence note when the recorded command invoked one
  of the repo-owned validators, smokes, install/check helpers, or the
  workflow-state writer. Observational.
- `read-advisor.py` (event: `beforeReadFile`) always returns
  `permission=allow`. When the target basename is a known
  workflow-state document it appends a short `user_message` reminding the
  reader that the document is human-visible and schema-bounded.
- `claim-guard.py` (event: `afterFileEdit`) inspects edited public files for
  overclaims and legacy comparison language, then emits JSON diagnostics. It
  exits successfully for ordinary warnings and only blocks severe unsupported
  claims.
- `compact-reminder.py` (event: `preCompact`) reads any reachable
  workflow-state document and surfaces phase, role, and pending or failed
  acceptance criteria as `user_message` so the post-compact summary keeps
  the orchestration anchors. Fail-open.
- `stop-gate.py` (event: `stop`) reads stop-event JSON, surfaces a short
  reminder to verify acceptance criteria, and can read the active workflow
  state document (`.cursor/state/workflow-state.schema.json`) to list pending
  or failed acceptance criteria. It does not request another turn by default.

Events intentionally **not** wired here remain bounded:
`beforeMCPExecution`/`afterMCPExecution` only become useful once the repo
chooses an MCP server (currently `host-product-only`);
`afterAgentResponse`/`afterAgentThought` observe agent output, which is not
a checked-in artifact; and `beforeTabFileRead`/`afterTabFileEdit` belong to
Cursor's separate Tab inline-completion surface.

All scripts use only the Python standard library so local validation stays
portable. The hooks **read** state; they never write it. Background
workers, cross-session resume, and queued retries remain `host-product-only`
Cursor capabilities and are intentionally out of scope here.

## Opt-in tracing for runtime evidence

The shared helper at `_trace.py` (read-only with respect to workflow state)
appends one JSON line per hook invocation to a local trace file when the
following environment is set:

```bash
export OH_MY_CURSOR_HOOK_TRACE=1
# optional override; defaults to <repo-root>/.omcs/hook-trace.log
export OH_MY_CURSOR_HOOK_TRACE_FILE="$PWD/.omcs/hook-trace.live.log"
```

`.omcs/` is the oh-my-cursor scratch directory and is gitignored.

Each line is a JSON object with at least `ts`, `pid`, `hook`, and `event`
plus the decision-relevant fields the script computed (matched skills,
permission, status, checked-file basename, error counts, and so on). The
`.omcs/` directory is gitignored so traces stay local to your machine.

A typical live-runtime capture looks like:

```bash
./scripts/install-local-plugin.sh
mkdir -p .omc && rm -f .omcs/hook-trace.live.log
OH_MY_CURSOR_HOOK_TRACE=1 \
  OH_MY_CURSOR_HOOK_TRACE_FILE="$PWD/.omcs/hook-trace.live.log" \
  cursor-agent -p --output-format text --model auto --mode ask \
    --trust --workspace "$PWD" \
    "Reply with exactly: HOOK_LIVE_OK"
nl -ba .omcs/hook-trace.live.log
```

If a wired hook event fires during the run, the matching line appears in
the log. Events Cursor does not invoke for a given session simply do not
appear; their script-level correctness can still be verified with
`OH_MY_CURSOR_HOOK_TRACE=1 ./scripts/smoke-cursor-workflow-artifacts.sh`.

For the orchestration-first overview, see [`docs/orchestration.md`](../../docs/orchestration.md).
The shared workflow-state contract lives under [`.cursor/state/`](../state/README.md).
