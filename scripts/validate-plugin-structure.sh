#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

required=(
  .cursor-plugin/plugin.json
  rules/repo-owned-plugin-boundary.mdc
  skills/local-plugin-check/SKILL.md
  docs/local-plugin-verification.md
  scripts/install-local-plugin.sh
)

for path in "${required[@]}"; do
  [[ -f "$path" ]] || fail "missing required plugin file: $path"
  log "$path"
done

command -v python3 >/dev/null 2>&1 || fail "python3 not found"

python3 - <<'PY'
from __future__ import annotations
import json
import pathlib
import re

root = pathlib.Path.cwd()
manifest_path = root / ".cursor-plugin" / "plugin.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

name = manifest.get("name")
if name != "oh-my-cursor":
    raise SystemExit(f"FAIL: plugin manifest name must be 'oh-my-cursor', got {name!r}")

if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
    raise SystemExit("FAIL: plugin manifest name must be lowercase kebab-case")

description = manifest.get("description")
if not isinstance(description, str) or not description.strip():
    raise SystemExit("FAIL: plugin manifest must include a non-empty description")

version = manifest.get("version")
if not isinstance(version, str) or not version.strip():
    raise SystemExit("FAIL: plugin manifest must include a non-empty version")

author = manifest.get("author")
if not isinstance(author, dict) or not str(author.get("name", "")).strip():
    raise SystemExit("FAIL: plugin manifest must include author.name")

print("ok: plugin manifest fields are present and well-formed")
PY

rules_count="$(find rules -type f \( -name '*.md' -o -name '*.mdc' -o -name '*.markdown' \) | wc -l | tr -d ' ')"
skills_count="$(find skills -type f -name 'SKILL.md' | wc -l | tr -d ' ')"
hooks_count="$(find . -path './.git' -prune -o -name 'hooks.json' -print | wc -l | tr -d ' ')"
agents_count="$(find . -path './.git' -prune -o -name '*.agent.md' -print | wc -l | tr -d ' ')"

[[ "$rules_count" -ge 1 ]] || fail "expected at least one plugin-owned rule"
[[ "$skills_count" -ge 1 ]] || fail "expected at least one plugin-owned skill"
[[ "$hooks_count" == "0" ]] || fail "hook manifests remain deferred for this repo"
[[ "$agents_count" == "0" ]] || fail "custom agent packaging remains deferred for this repo"

log "plugin-owned rule count is $rules_count"
log "plugin-owned skill count is $skills_count"
log "hooks remain deferred"
log "custom agents remain deferred"

grep -q '\.cursor-plugin/plugin.json' README.md || fail "README must mention the repo-root plugin manifest"
grep -q '~/.cursor/plugins/local/oh-my-cursor' README.md || fail "README must mention the local plugin path"
grep -q 'scripts/install-local-plugin.sh' README.md || fail "README must mention the local plugin install helper"
grep -q '\.cursor-plugin/plugin.json' docs/local-plugin-verification.md || fail "local plugin verification doc must mention the manifest"
grep -q '~/.cursor/plugins/local/oh-my-cursor' docs/local-plugin-verification.md || fail "local plugin verification doc must mention the local plugin path"
grep -q 'scripts/install-local-plugin.sh' docs/local-plugin-verification.md || fail "local plugin verification doc must mention the install helper"

log "plugin docs mention the manifest and local plugin load path"
