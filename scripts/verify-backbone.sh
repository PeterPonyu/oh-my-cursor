#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

required=(
  AGENTS.md
  README.md
  benchmark/README.md
  .cursor/rules/00-repo-scope.mdc
  .cursor/rules/10-docs-claims.mdc
  docs/confirmed-surfaces.md
  docs/fallback-policy.md
  docs/references.md
  docs/state-contract.md
)

for path in "${required[@]}"; do
  [[ -f "$path" ]] || fail "missing required backbone file: $path"
  log "$path"
done

grep -q 'repo-owned' README.md || fail "README must keep repo-owned vocabulary"
grep -q 'host-product-only' README.md || fail "README must keep host-product-only vocabulary"
grep -q 'unsupported-or-out-of-scope' README.md || fail "README must keep unsupported-or-out-of-scope vocabulary"
grep -q 'AGENTS.md' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention AGENTS.md"
grep -q '\.cursor/rules' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention .cursor/rules"
grep -q 'unsupported-or-out-of-scope' docs/fallback-policy.md || fail "fallback policy must keep unsupported-or-out-of-scope wording"
grep -q 'host-product-only' docs/fallback-policy.md || fail "fallback policy must keep host-product-only wording"
grep -q 'docs.cursor.com/en/cli/using' docs/references.md || fail "references doc must keep Cursor CLI source link"
grep -Eq 'different, smaller contract' benchmark/README.md || fail "benchmark README must describe the smaller Cursor benchmark contract"
grep -Eq 'reporting-comparable' benchmark/README.md || fail "benchmark README must keep reporting-comparable wording"

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
    "plugin/package loading": rf"\b{subject}\b.{{0,80}}\b{verb}\b.{{0,80}}\b(?:plugin/package(?: loading| support| packaging)?|plugin loading|package loading|plugin packaging)\b",
    "repo-file custom modes": rf"\b{subject}\b.{{0,80}}\b{verb}\b.{{0,80}}\brepo[- ](?:file|native)\b.{{0,60}}\bcustom modes?\b",
    "repo-file background agents": rf"\b{subject}\b.{{0,80}}\b{verb}\b.{{0,80}}\brepo[- ](?:file|native)\b.{{0,60}}\bbackground[- ]agents?\b",
    "default checked-in mcp config": rf"\b{subject}\b.{{0,80}}\b{verb}\b.{{0,80}}\b(?:default|checked[- ]in|repo[- ]owned)\b.{{0,40}}(?:\.cursor/mcp\.json|mcp config)\b",
    "repo-native skill bundles": rf"\b{subject}\b.{{0,80}}\b{verb}\b.{{0,80}}\brepo[- ]native\b.{{0,40}}\bskill bundles?\b",
    "checked-in custom-agent packaging": rf"\b{subject}\b.{{0,80}}\b{verb}\b.{{0,80}}\b(?:checked[- ]in\s+)?custom[- ]agent packaging\b",
    "checked-in hook packaging": rf"\b{subject}\b.{{0,80}}\b{verb}\b.{{0,80}}\b(?:checked[- ]in\s+)?hook(?: manifests?| packaging surface|s)\b",
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

echo 'verification: repository backbone files, claim vocabulary, and positive overclaim protections are present'
