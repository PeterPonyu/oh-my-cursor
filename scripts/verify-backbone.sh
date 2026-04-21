#!/usr/bin/env bash
set -euo pipefail

required=(
  AGENTS.md
  README.md
  .cursor/rules/00-repo-scope.mdc
  .cursor/rules/10-docs-claims.mdc
  docs/confirmed-surfaces.md
  docs/fallback-policy.md
  docs/references.md
)

for path in "${required[@]}"; do
  [[ -f "$path" ]] || { echo "missing: $path"; exit 1; }
  echo "ok: $path"
done

grep -q 'plugin/package loading' docs/fallback-policy.md
grep -q 'AGENTS.md' docs/confirmed-surfaces.md
grep -q '\.cursor/rules' docs/confirmed-surfaces.md
grep -q 'docs.cursor.com/en/cli/using' docs/references.md

echo 'verification: repository backbone files and fallback language present'
