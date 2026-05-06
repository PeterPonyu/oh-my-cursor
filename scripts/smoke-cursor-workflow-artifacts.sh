#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

after_payload='{"event":"afterFileEdit","edited_files":["README.md"]}'
stop_payload='{"event":"stop","status":"ok","loop_count":0}'

printf '%s\n' "$after_payload" \
  | python3 .cursor/hooks/claim-proof-audit.py \
  | python3 -m json.tool >/dev/null

printf '%s\n' "$stop_payload" \
  | python3 .cursor/hooks/completion-summary-audit.py \
  | python3 -m json.tool >/dev/null

python3 scripts/validate-cursor-workflow-artifacts.py

echo "CURSOR_WORKFLOW_ARTIFACTS_SMOKE_OK"