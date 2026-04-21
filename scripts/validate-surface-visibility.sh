#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

required=(
  AGENTS.md
  README.md
  .cursor/rules/00-repo-scope.mdc
  .cursor/rules/10-docs-claims.mdc
  docs/confirmed-surfaces.md
  docs/fallback-policy.md
  docs/references.md
  scripts/check-default-auth.sh
  scripts/validate-state-contract.sh
  scripts/smoke-cursor-agent.sh
  scripts/verify-backbone.sh
)

for path in "${required[@]}"; do
  [[ -f "$path" ]] || fail "missing required visible surface: $path"
  log "$path"
done

agents_count="$(find . -path './.git' -prune -o -name '*.agent.md' -print | wc -l | tr -d ' ')"
prompts_count="$(find . -path './.git' -prune -o -name '*.prompt.md' -print | wc -l | tr -d ' ')"
skills_count="$(find . -path './.git' -prune -o -name 'SKILL.md' -print | wc -l | tr -d ' ')"
hooks_count="$(find . -path './.git' -prune -o -name 'hooks.json' -print | wc -l | tr -d ' ')"

[[ "$agents_count" == "0" ]] || fail "unexpected checked-in custom agent files: $agents_count"
[[ "$prompts_count" == "0" ]] || fail "unexpected checked-in prompt files: $prompts_count"
[[ "$skills_count" == "0" ]] || fail "unexpected checked-in skill files: $skills_count"
[[ "$hooks_count" == "0" ]] || fail "unexpected checked-in hook manifests: $hooks_count"

log "current repo intentionally has 0 checked-in custom agents"
log "current repo intentionally has 0 checked-in prompt files"
log "current repo intentionally has 0 checked-in skill bundles"
log "current repo intentionally has 0 checked-in hook manifests"

grep -q 'does \*\*not\*\* claim' README.md || fail "README must keep non-claim boundary wording"
grep -q 'AGENTS.md' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention AGENTS.md"
grep -q '\.cursor/rules' docs/confirmed-surfaces.md || fail "confirmed surfaces doc must mention .cursor/rules"

log "surface visibility validation complete"
