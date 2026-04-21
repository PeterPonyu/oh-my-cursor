#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/check-default-auth.sh

Checks the local default Cursor auth/model state used by this machine:
  - cursor-agent is installed
  - cursor-agent whoami succeeds
  - cursor-agent models includes the `auto` model
  - ~/.cursor/cli-config.json contains auth/model state
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

command -v cursor-agent >/dev/null 2>&1 || fail "cursor-agent not found"
command -v python3 >/dev/null 2>&1 || fail "python3 not found"

whoami_output="$(cursor-agent whoami 2>&1)" || {
  printf '%s\n' "$whoami_output" >&2
  fail "cursor-agent whoami failed"
}
printf '%s\n' "$whoami_output" | grep -qi 'logged in' || fail "cursor-agent whoami did not confirm login"
printf '%s\n' "$whoami_output"
printf 'CURSOR_AUTH_OK\n'
log "default Cursor auth is available"

models_output="$(cursor-agent models 2>&1)" || {
  printf '%s\n' "$models_output" >&2
  fail "cursor-agent models failed"
}
printf '%s\n' "$models_output" | grep -q '^auto - Auto' || fail "cursor-agent models is missing auto"
printf 'CURSOR_MODEL_AUTO_OK\n'
log "cursor-agent exposes the auto model"

python3 - <<'PY'
from __future__ import annotations
import json
import pathlib

cfg = pathlib.Path.home() / ".cursor" / "cli-config.json"
data = json.loads(cfg.read_text(encoding="utf-8"))
auth = data.get("authInfo") or {}
model = data.get("model") or {}
if not auth.get("email"):
    raise SystemExit("FAIL: ~/.cursor/cli-config.json missing authInfo.email")
if not model.get("modelId"):
    raise SystemExit("FAIL: ~/.cursor/cli-config.json missing model.modelId")
print(f"ok: cursor config auth user is {auth['email']}")
print(f"ok: cursor config default model is {model['modelId']}")
PY
