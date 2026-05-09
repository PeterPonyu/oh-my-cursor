#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

session_start_payload='{"event":"sessionStart","session_id":"smoke","is_background_agent":false,"composer_mode":"agent"}'
session_end_payload='{"event":"sessionEnd","session_id":"smoke","reason":"completed","duration_ms":1000,"final_status":"completed"}'
prompt_payload='{"event":"beforeSubmitPrompt","prompt":"please run phase-controller and verify the orchestration"}'
pre_tool_payload='{"event":"preToolUse","tool_name":"Edit","tool_input":{"file_path":"README.md"}}'
post_tool_payload='{"event":"postToolUse","tool_name":"Edit","tool_input":{"file_path":"README.md"},"tool_output":"ok"}'
post_tool_failure_payload='{"event":"postToolUseFailure","tool_name":"Bash","tool_input":{"command":"false"},"error_message":"exit 1","failure_type":"fixable"}'
subagent_start_payload='{"event":"subagentStart","subagent_id":"sa1","subagent_type":"verifier","task":"check"}'
subagent_stop_payload='{"event":"subagentStop","subagent_type":"verifier","status":"completed","summary":"ok","duration_ms":500}'
shell_payload='{"event":"beforeShellExecution","command":"git status"}'
shell_debrief_payload='{"event":"afterShellExecution","command":"python3 scripts/validate-workflow-state.py","output":"WORKFLOW_STATE_OK","duration":150,"sandbox":"trusted"}'
read_payload='{"event":"beforeReadFile","file_path":".cursor/state/workflow-state.example.json","content":""}'
after_payload='{"event":"afterFileEdit","edited_files":["README.md"]}'
compact_payload='{"event":"preCompact","trigger":"auto","context_usage_percent":85}'
stop_payload='{"event":"stop","status":"ok","loop_count":0}'

printf '%s\n' "$session_start_payload"      | python3 hooks/session-bootstrap.py    | python3 -m json.tool >/dev/null
printf '%s\n' "$session_end_payload"        | python3 hooks/session-summary.py      | python3 -m json.tool >/dev/null
printf '%s\n' "$prompt_payload"             | python3 hooks/prompt-router.py        | python3 -m json.tool >/dev/null
printf '%s\n' "$pre_tool_payload"           | python3 hooks/tool-guard.py           | python3 -m json.tool >/dev/null
printf '%s\n' "$post_tool_payload"          | python3 hooks/state-watcher.py        | python3 -m json.tool >/dev/null
printf '%s\n' "$post_tool_failure_payload"  | python3 hooks/failure-router.py       | python3 -m json.tool >/dev/null
printf '%s\n' "$subagent_start_payload"     | python3 hooks/subagent-bootstrap.py   | python3 -m json.tool >/dev/null
printf '%s\n' "$subagent_stop_payload"      | python3 hooks/subagent-summary.py     | python3 -m json.tool >/dev/null
printf '%s\n' "$shell_payload"              | python3 hooks/shell-guard.py          | python3 -m json.tool >/dev/null
printf '%s\n' "$shell_debrief_payload"      | python3 hooks/shell-debrief.py        | python3 -m json.tool >/dev/null
printf '%s\n' "$read_payload"               | python3 hooks/read-advisor.py         | python3 -m json.tool >/dev/null
printf '%s\n' "$after_payload"              | python3 hooks/claim-guard.py          | python3 -m json.tool >/dev/null
printf '%s\n' "$compact_payload"            | python3 hooks/compact-reminder.py     | python3 -m json.tool >/dev/null
printf '%s\n' "$stop_payload"               | python3 hooks/stop-gate.py            | python3 -m json.tool >/dev/null

python3 scripts/validate-cursor-workflow-artifacts.py
python3 scripts/validate-workflow-state.py >/dev/null

echo "CURSOR_WORKFLOW_ARTIFACTS_SMOKE_OK"