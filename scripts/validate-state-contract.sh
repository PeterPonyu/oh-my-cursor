#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null 2>&1 || fail "python3 not found"

python3 - <<'PY'
from __future__ import annotations
import json
import pathlib

root = pathlib.Path.cwd().resolve()
cursor_cfg = pathlib.Path.home() / ".cursor" / "cli-config.json"

if not cursor_cfg.is_file():
    raise SystemExit(f"FAIL: missing Cursor CLI config: {cursor_cfg}")

cfg = json.loads(cursor_cfg.read_text(encoding="utf-8"))
auth = cfg.get("authInfo") or {}
model = cfg.get("model") or {}
if not auth.get("email"):
    raise SystemExit("FAIL: ~/.cursor/cli-config.json missing authInfo.email")
if not model.get("modelId"):
    raise SystemExit("FAIL: ~/.cursor/cli-config.json missing model.modelId")

print(f"ok: user-level Cursor auth is stored outside the repo: {cursor_cfg}")
print(f"ok: cursor auth user is {auth['email']}")
print(f"ok: cursor default model is {model['modelId']}")

if (root / ".cursor" / "mcp.json").exists():
    raise SystemExit("FAIL: .cursor/mcp.json should not be checked in before a concrete MCP choice")
if (root / ".cursor" / "memories").exists():
    raise SystemExit("FAIL: .cursor/memories should not be checked in for the backbone")

gitignore = (root / ".gitignore").read_text(encoding="utf-8")
for required in (".cursor/mcp.json", ".cursor/memories/"):
    if required not in gitignore:
        raise SystemExit(f"FAIL: .gitignore missing {required}")
print("ok: .gitignore blocks speculative Cursor state files")
PY

log "Cursor state contract validation complete"
