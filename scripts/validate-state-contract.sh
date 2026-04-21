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
repo_cli_cfg = root / ".cursor" / "cli-config.json"

if repo_cli_cfg.exists():
    raise SystemExit("FAIL: .cursor/cli-config.json must stay user-level, not checked into the repo")

if (root / ".cursor" / "mcp.json").exists():
    raise SystemExit("FAIL: .cursor/mcp.json should not be checked in before a concrete MCP choice")
if (root / ".cursor" / "memories").exists():
    raise SystemExit("FAIL: .cursor/memories should not be checked in for the backbone")

gitignore = (root / ".gitignore").read_text(encoding="utf-8")
for required in (".cursor/mcp.json", ".cursor/memories/"):
    if required not in gitignore:
        raise SystemExit(f"FAIL: .gitignore missing {required}")
print("ok: .gitignore blocks speculative Cursor state files")

if not cursor_cfg.is_file():
    print(f"bounded: no user-level Cursor CLI config found at {cursor_cfg}; auth/model runtime proof remains environment-gated")
else:
    try:
        cfg = json.loads(cursor_cfg.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"bounded: could not parse {cursor_cfg}; auth/model runtime proof remains environment-gated ({exc})")
    else:
        auth = cfg.get("authInfo") or {}
        model = cfg.get("model") or {}
        email = auth.get("email")
        model_id = model.get("modelId")
        print(f"ok: user-level Cursor auth/model state is stored outside the repo: {cursor_cfg}")
        if email:
            print(f"ok: cursor auth user is {email}")
        else:
            print("bounded: ~/.cursor/cli-config.json lacks authInfo.email; auth proof remains environment-gated")
        if model_id:
            print(f"ok: cursor default model is {model_id}")
        else:
            print("bounded: ~/.cursor/cli-config.json lacks model.modelId; model proof remains environment-gated")
PY

log "Cursor state contract validation complete"
