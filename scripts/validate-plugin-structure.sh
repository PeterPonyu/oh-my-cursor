#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# --self-test mode (AC-110/AC-107): read-only checks, no working-tree mutation
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--self-test" ]]; then
  echo "self-test: tracked mcp.json detection"
  if git ls-files .cursor/mcp.json 2>/dev/null | grep -q .; then
    echo "self-test: real repo has tracked .cursor/mcp.json (unexpected)"; exit 1
  fi
  echo "self-test: no tracked .cursor/mcp.json — passes negative case"
  echo "self-test: .cursor/mcp.example.json present check"
  [[ -f .cursor/mcp.example.json ]] || { echo "self-test: missing .cursor/mcp.example.json"; exit 1; }
  echo "VALIDATE_PLUGIN_STRUCTURE_SELF_TEST_OK"
  exit 0
fi

required=(
  .cursor-plugin/plugin.json
    .cursor/hooks.json
    .cursor/hooks/README.md
    .cursor/hooks/claim-guard.py
    .cursor/hooks/stop-gate.py
    .cursor/state/workflow-state.schema.json
    .cursor/state/workflow-state.example.json
    .cursor/state/workflow-state.py
    .cursor/state/README.md
    .cursor/agents/orchestrator.md
    .cursor/agents/verifier.md
    .cursor/agents/critic.md
    .cursor/agents/debugger.md
    .cursor/agents/security-reviewer.md
    .cursor/agents/planner.md
    .cursor/agents/researcher.md
    .cursor/mcp.example.json
  rules/repo-owned-plugin-boundary.mdc
  skills/local-plugin-check/SKILL.md
  skills/phase-controller/SKILL.md
  docs/local-plugin-verification.md
  docs/orchestration.md
  CHANGELOG.md
  scripts/install-local-plugin.sh
  scripts/check-local-plugin-install.sh
    scripts/validate-cursor-workflow-artifacts.py
    scripts/smoke-cursor-workflow-artifacts.sh
    scripts/validate-workflow-state.py
    scripts/workflow-state.py
)

for path in "${required[@]}"; do
  [[ -f "$path" ]] || fail "missing required plugin file: $path"
  log "$path"
done

# AC-107: .cursor/mcp.json must never be tracked in git
if git ls-files .cursor/mcp.json 2>/dev/null | grep -q .; then
  fail "tracked .cursor/mcp.json is forbidden; use .cursor/mcp.example.json instead"
fi
log ".cursor/mcp.json is not tracked (correct)"

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

expected_paths = {
    "rules": "rules",
    "skills": "skills",
    "agents": ".cursor/agents",
    "hooks": ".cursor/hooks.json",
}
for key, expected in expected_paths.items():
    actual = manifest.get(key)
    if actual != expected:
        raise SystemExit(f"FAIL: plugin manifest must set {key!r} to {expected!r}, got {actual!r}")

print("ok: plugin manifest fields are present and well-formed")
PY

rules_count="$(find rules -type f \( -name '*.md' -o -name '*.mdc' -o -name '*.markdown' \) | wc -l | tr -d ' ')"
skills_count="$(find skills -type f -name 'SKILL.md' | wc -l | tr -d ' ')"
hooks_count="$(find .cursor -path './.git' -prune -o -name 'hooks.json' -print | wc -l | tr -d ' ')"
agents_count="$(find .cursor/agents -type f -name '*.md' | wc -l | tr -d ' ')"

[[ "$rules_count" -ge 1 ]] || fail "expected at least one plugin-owned rule"
[[ "$skills_count" -ge 1 ]] || fail "expected at least one plugin-owned skill"
[[ "$hooks_count" == "1" ]] || fail "expected exactly one project hook manifest"
[[ "$agents_count" -ge 7 ]] || fail "expected at least seven checked-in project agents"

log "plugin-owned rule count is $rules_count"
log "plugin-owned skill count is $skills_count"
log "project hook manifest count is $hooks_count"
log "checked-in project agent count is $agents_count"

python3 scripts/validate-cursor-workflow-artifacts.py
python3 scripts/validate-workflow-state.py >/dev/null

grep -q '\.cursor-plugin/plugin.json' README.md || fail "README must mention the repo-root plugin manifest"
grep -q '~/.cursor/plugins/local/oh-my-cursor' README.md || fail "README must mention the local plugin path"
grep -q 'scripts/install-local-plugin.sh' README.md || fail "README must mention the local plugin install helper"
grep -q 'scripts/check-local-plugin-install.sh' README.md || fail "README must mention the CI-safe install check"
grep -q '\.cursor-plugin/plugin.json' docs/local-plugin-verification.md || fail "local plugin verification doc must mention the manifest"
grep -q '~/.cursor/plugins/local/oh-my-cursor' docs/local-plugin-verification.md || fail "local plugin verification doc must mention the local plugin path"
grep -q 'scripts/install-local-plugin.sh' docs/local-plugin-verification.md || fail "local plugin verification doc must mention the install helper"
grep -q 'scripts/check-local-plugin-install.sh' docs/local-plugin-verification.md || fail "local plugin verification doc must mention the CI-safe install check"

log "plugin docs mention the manifest and local plugin load path"
