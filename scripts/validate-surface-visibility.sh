#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

required=(
  AGENTS.md
  CHANGELOG.md
  README.md
  .cursor-plugin/plugin.json
  hooks/hooks.json
    hooks/README.md
    hooks/claim-guard.py
    hooks/prompt-router.py
    hooks/shell-guard.py
    hooks/stop-gate.py
    hooks/session-bootstrap.py
    hooks/session-summary.py
    hooks/tool-guard.py
    hooks/state-watcher.py
    hooks/failure-router.py
    hooks/subagent-bootstrap.py
    hooks/subagent-summary.py
    hooks/shell-debrief.py
    hooks/read-advisor.py
    hooks/compact-reminder.py
    .cursor/state/workflow-state.schema.json
    .cursor/state/workflow-state.example.json
    .cursor/state/workflow-state.py
    .cursor/state/README.md
    agents/orchestrator.md
    agents/verifier.md
    agents/critic.md
    agents/debugger.md
    agents/security-reviewer.md
    agents/planner.md
    agents/researcher.md
  rules/repo-owned-plugin-boundary.mdc
  skills/local-plugin-check/SKILL.md
  skills/phase-controller/SKILL.md
  .cursor/rules/00-repo-scope.mdc
  .cursor/rules/10-docs-claims.mdc
  docs/confirmed-surfaces.md
  docs/archive/fallback-policy.md
  docs/local-plugin-verification.md
  docs/orchestration.md
  docs/references.md
  docs/state-contract.md
  scripts/check-local-plugin-install.sh
  scripts/check-default-auth.sh
  scripts/install-local-plugin.sh
  scripts/validate-plugin-structure.sh
  scripts/validate-mcp-server-structure.py
  scripts/smoke-mcp-cursor-state-bridge.sh
  scripts/validate-rename-references.py
  scripts/validate-prd-ac-mapping.py
  scripts/validate-hook-readonly.py
  scripts/validate-agent-bridge-contract.py
    scripts/validate-public-language.py
    scripts/validate-cursor-workflow-artifacts.py
    scripts/smoke-cursor-workflow-artifacts.sh
    scripts/validate-workflow-state.py
        scripts/workflow-state.py
  scripts/validate-state-contract.sh
  scripts/smoke-cursor-agent.sh
  scripts/verify-backbone.sh
)

for path in "${required[@]}"; do
  [[ -f "$path" ]] || fail "missing required visible surface: $path"
  log "$path"
done

agents_count="$(find agents -type f -name '*.md' | wc -l | tr -d ' ')"
prompts_count="$(find . -path './.git' -prune -o -name '*.prompt.md' -print | wc -l | tr -d ' ')"
skills_count="$(find . -path './.git' -prune -o -name 'SKILL.md' -print | wc -l | tr -d ' ')"
hooks_count="$(find . -path './.git' -prune -o -path './dist' -prune -o -name 'hooks.json' -print | wc -l | tr -d ' ')"

[[ "$agents_count" -ge "7" ]] || fail "expected at least seven checked-in project agents"
[[ "$prompts_count" == "0" ]] || fail "unexpected checked-in prompt files: $prompts_count"
[[ "$skills_count" -ge "1" ]] || fail "expected at least one checked-in skill file"
[[ "$hooks_count" == "1" ]] || fail "expected exactly one checked-in hook manifest"

log "current repo ships checked-in project agents"
log "current repo intentionally has 0 checked-in prompt files"
log "current repo ships at least one checked-in skill bundle"
log "current repo ships one checked-in hook manifest"

command -v python3 >/dev/null 2>&1 || fail "python3 not found"

python3 - <<'PY'
from __future__ import annotations
import pathlib
import re

root = pathlib.Path.cwd().resolve()
files = [
    root / "AGENTS.md",
    root / "README.md",
    *sorted((root / "docs").glob("*.md")),
]

subject = r"(?:oh-my-cursor|this repo|this repository|the repo|this backbone|the backbone|repository|repo)"
verb = r"(?:ships?|provides?|includes?|owns?|supports?|provisions?|configures?)"
patterns = {
    "repo-file custom modes": rf"\b{subject}\b.{{0,80}}\b{verb}\b.{{0,80}}\brepo[- ](?:file|native)\b.{{0,60}}\bcustom modes?\b",
    "repo-file background agents": rf"\b{subject}\b.{{0,80}}\b{verb}\b.{{0,80}}\brepo[- ](?:file|native)\b.{{0,60}}\bbackground[- ]agents?\b",
    "default checked-in mcp config": rf"\b{subject}\b.{{0,80}}\b{verb}\b.{{0,80}}\b(?:default|checked[- ]in|repo[- ]owned)\b.{{0,40}}(?:\.cursor/mcp\.json|mcp config)\b",
}
negations = (
    "does not",
    "do not",
    "not ",
    "without",
    "unless",
    "unsupported",
    "out-of-scope",
    "not currently",
    "not yet",
    "avoid",
    "left opt-in",
    "unclaimed",
)

violations: list[str] = []
for path in files:
    for lineno, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = " ".join(raw_line.lower().split())
        if not line or any(neg in line for neg in negations):
            continue
        for label, pattern in patterns.items():
            if re.search(pattern, line):
                rel = path.relative_to(root)
                violations.append(f"{rel}:{lineno}: {label}: {raw_line.strip()}")

if violations:
    raise SystemExit(
        "FAIL: positive overclaim scan found unsupported repo-owned wording\n"
        + "\n".join(violations)
    )

print("ok: positive overclaim scan stayed clean for README/AGENTS/docs notes")
PY

./scripts/validate-plugin-structure.sh
python3 scripts/validate-public-language.py
python3 scripts/validate-cursor-workflow-artifacts.py
grep -q 'AGENTS.md' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention AGENTS.md"
grep -q '\.cursor/rules' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention .cursor/rules"
grep -q 'hooks/hooks.json' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention hooks/hooks.json"
grep -q 'agents/' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention agents"
python3 - <<'PY'
from __future__ import annotations
import pathlib

text = pathlib.Path("README.md").read_text(encoding="utf-8")
start = text.find("## Quick start")
end = text.find("## What's included", start)
if start == -1 or end == -1:
    raise SystemExit("FAIL: README is missing the Quick start -> What's included structure")
segment = text[start:end]
required = [
]
print("ok: README Quick start -> What's included structure present")
PY
log "DISCOVERABILITY_OK"

log "surface visibility validation complete"
