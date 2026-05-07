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
  benchmark/README.md
  .cursor-plugin/plugin.json
    .cursor/hooks.json
    .cursor/hooks/README.md
    .cursor/hooks/claim-guard.py
    .cursor/hooks/prompt-router.py
    .cursor/hooks/shell-guard.py
    .cursor/hooks/stop-gate.py
    .cursor/hooks/session-bootstrap.py
    .cursor/hooks/session-summary.py
    .cursor/hooks/tool-guard.py
    .cursor/hooks/state-watcher.py
    .cursor/hooks/failure-router.py
    .cursor/hooks/subagent-bootstrap.py
    .cursor/hooks/subagent-summary.py
    .cursor/hooks/shell-debrief.py
    .cursor/hooks/read-advisor.py
    .cursor/hooks/compact-reminder.py
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
  rules/repo-owned-plugin-boundary.mdc
  skills/local-plugin-check/SKILL.md
  skills/phase-controller/SKILL.md
  .cursor/rules/00-repo-scope.mdc
  .cursor/rules/10-docs-claims.mdc
  docs/confirmed-surfaces.md
  docs/fallback-policy.md
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
    scripts/validate-public-language.py
    scripts/validate-cursor-workflow-artifacts.py
    scripts/smoke-cursor-workflow-artifacts.sh
    scripts/validate-workflow-state.py
        scripts/workflow-state.py
  scripts/validate-pages-surface.sh
  scripts/validate-state-contract.sh
  scripts/smoke-cursor-agent.sh
  scripts/verify-backbone.sh
)

for path in "${required[@]}"; do
  [[ -f "$path" ]] || fail "missing required visible surface: $path"
  log "$path"
done

agents_count="$(find .cursor/agents -type f -name '*.md' | wc -l | tr -d ' ')"
prompts_count="$(find . -path './.git' -prune -o -name '*.prompt.md' -print | wc -l | tr -d ' ')"
skills_count="$(find . -path './.git' -prune -o -name 'SKILL.md' -print | wc -l | tr -d ' ')"
hooks_count="$(find .cursor -path './.git' -prune -o -name 'hooks.json' -print | wc -l | tr -d ' ')"

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
    root / "benchmark" / "README.md",
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

print("ok: positive overclaim scan stayed clean for README/AGENTS/docs/benchmark notes")
PY

./scripts/validate-plugin-structure.sh
python3 scripts/validate-public-language.py
python3 scripts/validate-cursor-workflow-artifacts.py
grep -q 'AGENTS.md' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention AGENTS.md"
grep -q '\.cursor/rules' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention .cursor/rules"
grep -q '\.cursor/hooks.json' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention .cursor/hooks.json"
grep -q '\.cursor/agents' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention .cursor/agents"
grep -q 'cursor-backbone-site' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention the landing-site proof rule"
grep -Eq 'focused Cursor benchmark contract' benchmark/README.md || fail "benchmark README must describe the focused Cursor benchmark contract"
grep -Eq 'reporting-comparable' benchmark/README.md || fail "benchmark README must keep reporting-comparable wording"
python3 - <<'PY'
from __future__ import annotations
import pathlib

text = pathlib.Path("README.md").read_text(encoding="utf-8")
start = text.find("## Start here")
end = text.find("## Ownership map", start)
if start == -1 or end == -1:
    raise SystemExit("FAIL: README is missing the Start here -> Ownership map structure")
segment = text[start:end]
required = [
    "docs/refinement-priority-map.md",
    "docs/plugin-boundary-review.md",
    "scripts/validate-benchmark-evidence.sh",
]
missing = [item for item in required if item not in segment]
if missing:
    raise SystemExit(f"FAIL: README Start here section is missing required discoverability links: {missing}")
print("ok: README Start here section exposes refinement-priority, plugin-boundary, and benchmark-evidence links")
PY
log "REFINEMENT_MAP_OK"
log "PLUGIN_BOUNDARY_OK"
log "DISCOVERABILITY_OK"

./scripts/validate-pages-surface.sh

log "surface visibility validation complete"
