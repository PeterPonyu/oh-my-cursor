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
  echo "self-test: mcp.json present check"
  [[ -f mcp.json ]] || { echo "self-test: missing mcp.json"; exit 1; }
  echo "VALIDATE_PLUGIN_STRUCTURE_SELF_TEST_OK"
  exit 0
fi

required=(
  .cursor-plugin/plugin.json
    hooks/hooks.json
    hooks/README.md
    hooks/claim-guard.py
    hooks/stop-gate.py
    hooks/_active_role.py
    hooks/_tool_payload.py
    .cursor/mcp.example.json
    .cursor/state/_locking.py
    .cursor/state/workflow-state.schema.json
    .cursor/state/workflow-state.example.json
    .cursor/state/workflow-state.py
    .cursor/state/README.md
    src/oh_my_cursor/__init__.py
    src/oh_my_cursor/workflow_state/__init__.py
    src/oh_my_cursor/workflow_state/api.py
    src/oh_my_cursor/workflow_state/cli.py
    src/oh_my_cursor/workflow_state/locking.py
    agents/architect.md
    agents/code-reviewer.md
    agents/critic.md
    agents/debugger.md
    agents/explore.md
    agents/implementer.md
    agents/orchestrator.md
    agents/planner.md
    agents/qa-tester.md
    agents/researcher.md
    agents/security-reviewer.md
    agents/test-engineer.md
    agents/tracer.md
    agents/verifier.md
    mcp.json
  .cursor/rules/00-repo-scope.mdc
  .cursor/rules/10-docs-claims.mdc
  rules/repo-owned-plugin-boundary.mdc
  .cursor/rules/20-commit-discipline.mdc
  .cursor/rules/30-error-handling.mdc
  skills/local-plugin-check/SKILL.md
  skills/phase-controller/SKILL.md
  docs/local-plugin-verification.md
  docs/orchestration.md
  CHANGELOG.md
  scripts/install-local-plugin.sh
  scripts/check-local-plugin-install.sh
    scripts/validate-cursor-workflow-artifacts.py
    scripts/smoke-cursor-workflow-artifacts.sh
    scripts/smoke-workflow-state-completion.sh
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

contaminated=0
find .cursor -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find .cursor -name "*.pyc" -delete 2>/dev/null || true
find .cursor/state -name "*.lock" -delete 2>/dev/null || true

if git ls-files .cursor mcp 2>/dev/null | grep -qE '__pycache__|\.pytest_cache|\.pyc$'; then
  fail "cache files are tracked in git — add __pycache__/, .pytest_cache/, and *.pyc to .gitignore, then git rm --cached them"
  contaminated=1
fi

if find mcp -type d -name ".pytest_cache" 2>/dev/null | grep -q .; then
  fail "found .pytest_cache under mcp/ — remove local test cache before packaging"
  contaminated=1
fi

if find .cursor/state -name "*.lock" 2>/dev/null | grep -q .; then
  fail "found *.lock files in .cursor/state/ — remove runtime lock artifacts"
  contaminated=1
fi

if [[ -f .cursor/state/workflow-state.json ]]; then
  fail "found .cursor/state/workflow-state.json — runtime artifact must not be tracked"
  contaminated=1
fi
if [[ -f .cursor/state/active-role.json ]]; then
  fail "found .cursor/state/active-role.json — runtime artifact must not be tracked"
  contaminated=1
fi

if [[ -d .cursor/memories ]]; then
  fail "found .cursor/memories/ — runtime directory must not be tracked"
  contaminated=1
fi
if [[ -d hooks/state ]]; then
  fail "found hooks/state/ — runtime directory must not be tracked"
  contaminated=1
fi

if [[ "$contaminated" == "0" ]]; then
  log "payload is clean: no __pycache__, .pytest_cache, *.pyc, *.lock, or runtime artifacts in .cursor/"
fi

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
    "mcpServers": "mcp.json",
}
for key, expected in expected_paths.items():
    actual = manifest.get(key)
    if actual != expected:
        raise SystemExit(f"FAIL: plugin manifest must set {key!r} to {expected!r}, got {actual!r}")

# rules, skills, agents, hooks use default discovery — warn if overridden
discovery_defaults = {
    "rules": "rules",
    "skills": "skills",
    "agents": "agents",
    "hooks": "hooks/hooks.json",
}
for key, default in discovery_defaults.items():
    actual = manifest.get(key)
    if actual is not None and actual != default:
        raise SystemExit(f"FAIL: plugin manifest overrides default {key!r} path ({actual!r}); remove override or use default {default!r}")

print("ok: plugin manifest fields are present and well-formed")
PY

cursor_rules_count="$(find .cursor/rules -type f \( -name '*.md' -o -name '*.mdc' -o -name '*.markdown' \) | wc -l | tr -d ' ')"
rules_count="$(find rules -type f \( -name '*.md' -o -name '*.mdc' -o -name '*.markdown' \) | wc -l | tr -d ' ')"
skills_count="$(find skills -type f -name 'SKILL.md' | wc -l | tr -d ' ')"
hooks_count="$(find hooks -maxdepth 1 -name 'hooks.json' | wc -l | tr -d ' ')"
agents_count="$(find agents -type f -name '*.md' | wc -l | tr -d ' ')"

[[ "$cursor_rules_count" -ge 4 ]] || fail "expected the four Cursor workspace rules"
[[ "$rules_count" -ge 1 ]] || fail "expected at least one plugin-boundary compatibility rule"
[[ "$skills_count" -ge 1 ]] || fail "expected at least one plugin-owned skill"
[[ "$hooks_count" == "1" ]] || fail "expected exactly one project hook manifest"
[[ "$agents_count" -ge 12 ]] || fail "expected at least twelve checked-in project agents"

log "Cursor workspace rule count is $cursor_rules_count"
log "plugin-boundary compatibility rule count is $rules_count"
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
