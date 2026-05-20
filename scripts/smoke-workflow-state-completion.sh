#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

state="$tmpdir/workflow-state.json"
export OMCS_COMPLETION_SMOKE_STATE="$state"

python3 - <<'PY_STATE'
from __future__ import annotations
import importlib.util
import os
from pathlib import Path
root = Path.cwd()
state_path = Path(os.environ["OMCS_COMPLETION_SMOKE_STATE"])
spec = importlib.util.spec_from_file_location("workflow_state", root / ".cursor" / "state" / "workflow-state.py")
if spec is None or spec.loader is None:
    raise SystemExit("FAIL: could not load workflow-state library")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.init_state(state_path, task_id="omcs-completion-smoke", title="workflow-state completion smoke", phase="verify", status="in_progress", role="qa-tester", next_action="collect runtime evidence")
module.update_acceptance_criterion(state_path, ac_id="AC-001", criterion="state watcher reports direct workflow-state validation", status="passed", evidence="scripts/smoke-workflow-state-completion.sh:state-watcher")
module.update_acceptance_criterion(state_path, ac_id="AC-002", criterion="compact and stop hooks surface pending criteria", status="pending")
module.append_history(state_path, note="qa-tester collected partial smoke evidence")
PY_STATE

python3 scripts/validate-workflow-state.py "$state"

state_watcher_output="$(OH_MY_CURSOR_WORKSPACE="$ROOT" python3 hooks/state-watcher.py <<JSON
{"tool_name":"Edit","file_path":"$state","tool_input":{"file_path":"$state"}}
JSON
)"
[[ "$state_watcher_output" == *'"checked": true'* ]] || { printf '%s\n' "$state_watcher_output" >&2; echo "FAIL: state-watcher did not validate direct workflow-state edit" >&2; exit 1; }
[[ "$state_watcher_output" == *'matches .cursor/state/workflow-state.schema.json'* ]] || { printf '%s\n' "$state_watcher_output" >&2; echo "FAIL: state-watcher did not report schema match" >&2; exit 1; }

compact_output="$(OH_MY_CURSOR_WORKSPACE="$ROOT" OH_MY_CURSOR_WORKFLOW_STATE="$state" python3 hooks/compact-reminder.py <<'JSON'
{"trigger":"manual-smoke"}
JSON
)"
[[ "$compact_output" == *'AC-002'* ]] || { printf '%s\n' "$compact_output" >&2; echo "FAIL: compact-reminder did not surface pending acceptance criterion" >&2; exit 1; }

stop_output="$(OH_MY_CURSOR_WORKSPACE="$ROOT" OH_MY_CURSOR_WORKFLOW_STATE="$state" python3 hooks/stop-gate.py <<'JSON'
{"status":"passed","loop_count":0}
JSON
)"
[[ "$stop_output" == *'AC-002'* ]] || { printf '%s\n' "$stop_output" >&2; echo "FAIL: stop-gate did not surface pending acceptance criterion" >&2; exit 1; }

workspace_root="$tmpdir/workspace"
workspace_state="$workspace_root/.cursor/state/workflow-state.json"
mkdir -p "$(dirname "$workspace_state")"
cp "$state" "$workspace_state"
workspace_stop_output="$(OH_MY_CURSOR_WORKSPACE="$workspace_root" python3 hooks/stop-gate.py <<'JSON'
{"status":"passed","loop_count":0}
JSON
)"
[[ "$workspace_stop_output" == *'AC-002'* ]] || { printf '%s\n' "$workspace_stop_output" >&2; echo "FAIL: stop-gate did not read workspace default workflow-state" >&2; exit 1; }

python3 - <<'PY_DONE'
from __future__ import annotations
import importlib.util
import os
from pathlib import Path
root = Path.cwd()
state_path = Path(os.environ["OMCS_COMPLETION_SMOKE_STATE"])
spec = importlib.util.spec_from_file_location("workflow_state", root / ".cursor" / "state" / "workflow-state.py")
if spec is None or spec.loader is None:
    raise SystemExit("FAIL: could not reload workflow-state library")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.update_acceptance_criterion(state_path, ac_id="AC-002", criterion="compact and stop hooks surface pending criteria", status="passed", evidence="scripts/smoke-workflow-state-completion.sh:stop-gate")
module.set_state(state_path, phase="done", status="passed", role="verifier", next_action="stop session", note="completion smoke passed")
PY_DONE

python3 scripts/validate-workflow-state.py "$state"

final_stop_output="$(OH_MY_CURSOR_WORKSPACE="$ROOT" OH_MY_CURSOR_WORKFLOW_STATE="$state" python3 hooks/stop-gate.py <<'JSON'
{"status":"passed","loop_count":0}
JSON
)"
[[ "$final_stop_output" != *'pending acceptance criteria'* ]] || { printf '%s\n' "$final_stop_output" >&2; echo "FAIL: stop-gate reported pending criteria after completion" >&2; exit 1; }

echo "WORKFLOW_STATE_COMPLETION_SMOKE_OK"
