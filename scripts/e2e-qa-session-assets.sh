#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf 'ok: %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null 2>&1 || fail "python3 not found"

python3 - <<'PY'
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path.cwd()
PREFIX = "[OMCS]"


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def parse_frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        fail(f"{path.relative_to(ROOT)} missing YAML frontmatter")
    end = text.find("\n---", 4)
    if end == -1:
        fail(f"{path.relative_to(ROOT)} has unterminated YAML frontmatter")
    fields: dict[str, str] = {}
    for line in text[4:end].strip().splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip().strip("\"'")
    return fields


manifest = json.loads((ROOT / ".cursor-plugin" / "plugin.json").read_text(encoding="utf-8"))
for key in ("displayName", "description"):
    value = str(manifest.get(key, ""))
    if not value.startswith(PREFIX):
        fail(f".cursor-plugin/plugin.json {key} must start with {PREFIX}")

for base in ("skills", "agents", "rules"):
    for path in sorted((ROOT / base).rglob("*")):
        if path.suffix not in {".md", ".mdc"}:
            continue
        fields = parse_frontmatter(path)
        description = fields.get("description", "")
        if not description.startswith(PREFIX):
            fail(f"{path.relative_to(ROOT)} description must start with {PREFIX}")

print("OMCS_PREFIX_E2E_OK")
PY

tmp_root="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_root"
}
trap cleanup EXIT

"$ROOT/scripts/install-local-plugin.sh" --target-root "$tmp_root" --force >/dev/null
plugin_path="$tmp_root/oh-my-cursor"
[[ -f "$plugin_path/.cursor-plugin/plugin.json" ]] || fail "temp install missing plugin manifest"
[[ -f "$plugin_path/.cursor/mcp.example.json" ]] || fail "temp install missing MCP example template"
[[ -f "$plugin_path/hooks/hooks.json" ]] || fail "temp install missing hooks/hooks.json"
[[ ! -d "$plugin_path/mcp" ]] || fail "default temp install must not include mcp/"
log "temp local plugin install has OMCS payload and bounded MCP template"

python3 - <<'PY'
from __future__ import annotations

from pathlib import Path

ROOT = Path.cwd()
checks = {
    "docs/external-runtime-bridge.md": [
        "~/.claude/skills/",
        "~/.claude/agents/",
        "~/.codex/skills/",
        "~/.codex/agents/",
        "This is not an OMC-vs-Codex comparison",
        "host-product-discovered user assets",
    ],
    "docs/external-runtime-compatibility.md": [
        "Claude and Codex user skills",
        "~/.claude/skills/",
        "~/.codex/skills/",
        ".codex/",
    ],
    "docs/references.md": [
        ".claude/skills/",
        ".codex/skills/",
        ".claude/agents/",
        ".codex/agents/",
        "host-product-discovered",
    ],
}
missing: list[str] = []
for rel, tokens in checks.items():
    text = (ROOT / rel).read_text(encoding="utf-8")
    for token in tokens:
        if token not in text:
            missing.append(f"{rel}: {token}")
if missing:
    raise SystemExit("FAIL: missing external runtime compatibility documentation\n" + "\n".join(missing))
print("EXTERNAL_RUNTIME_COMPAT_DOCS_OK")
PY

installed="${HOME}/.cursor/plugins/local/oh-my-cursor"
if [[ -d "$installed" ]]; then
  installed_check_output="$(python3 - "$installed" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

plugin = Path(sys.argv[1])
manifest = json.loads((plugin / ".cursor-plugin" / "plugin.json").read_text(encoding="utf-8"))
if not str(manifest.get("displayName", "")).startswith("[OMCS]"):
    raise SystemExit("FAIL: installed local plugin displayName lacks [OMCS] prefix")
if not str(manifest.get("description", "")).startswith("[OMCS]"):
    raise SystemExit("FAIL: installed local plugin description lacks [OMCS] prefix")
print("INSTALLED_OMCS_PREFIX_OK")
PY
)" || {
    if [[ "${CHECK_INSTALLED_PLUGIN:-0}" == "1" ]]; then
      printf '%s\n' "$installed_check_output" >&2
      exit 1
    fi
    warn "installed local plugin prefix check failed; rerun install-local-plugin.sh --force for live-session parity"
    installed_check_output=""
  }
  [[ -z "$installed_check_output" ]] || printf '%s\n' "$installed_check_output"
else
  warn "local plugin is not installed at $installed; skipped installed-prefix check"
fi

if [[ "${CHECK_USER_COMPAT_ASSETS:-0}" == "1" ]]; then
  python3 - <<'PY'
from __future__ import annotations

from pathlib import Path

home = Path.home()
checks = {
    "~/.claude/skills": (home / ".claude" / "skills", "SKILL.md"),
    "~/.codex/skills": (home / ".codex" / "skills", "SKILL.md"),
    "~/.claude/agents": (home / ".claude" / "agents", "*.md"),
}
missing: list[str] = []
for label, (path, pattern) in checks.items():
    if not path.is_dir():
        missing.append(f"{label} is missing")
    elif not any(path.rglob(pattern)):
        missing.append(f"{label} contains no {pattern} files")
if missing:
    raise SystemExit("FAIL: CHECK_USER_COMPAT_ASSETS=1 failed\n" + "\n".join(missing))
codex_agents = home / ".codex" / "agents"
if codex_agents.exists() and not any(codex_agents.rglob("*.md")):
    raise SystemExit("FAIL: ~/.codex/agents exists but contains no agent markdown files")
if not codex_agents.exists():
    print("bounded: ~/.codex/agents is absent; Cursor will discover Codex user agents when that directory is present")
print("USER_COMPAT_ASSETS_OK")
PY
  log "OMC and Codex-side user compatibility skills are present; OMC agents are materialized"
else
  warn "set CHECK_USER_COMPAT_ASSETS=1 to assert local ~/.claude and ~/.codex compatibility assets"
fi

log "E2E_QA_SESSION_ASSETS_OK"
