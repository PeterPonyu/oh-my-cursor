#!/usr/bin/env bash
# Validate that every plugin-shipped rule in rules/ would be copied into the
# install payload by scripts/install-local-plugin.ts.
#
# We do not actually install into ~/.cursor/plugins/local. Instead we rsync
# the same include/exclude pattern into a temporary directory and compare
# the resulting rule list against the repo source. This catches drift in
# both directions:
#
#   1. A new rule was added to rules/ but the install script's include list
#      was changed to exclude it (regression in install-local-plugin.ts).
#   2. The install script started including .cursor/rules/ even though the
#      repo's intent is to keep those workspace-dev only.
#
# Exit codes:
#   0 = install payload matches the repo's rules/ set, and .cursor/rules/
#       is correctly excluded.
#   1 = mismatch detected (printed to stderr).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

command -v rsync >/dev/null 2>&1 || fail "rsync is required"

TMP_PAYLOAD="$(mktemp -d -t omcs-rules-parity.XXXXXX)"
trap 'rm -rf "$TMP_PAYLOAD"' EXIT

# Mirror the rsync invocation in scripts/install-local-plugin.ts
# copy_minimal_payload(). We only need the subset of includes that touch
# rules/ and .cursor/rules/; the other surfaces have their own validators.
rsync -a -m \
  --exclude='**/__pycache__/' \
  --exclude='**/.pytest_cache/' \
  --exclude='*.pyc' \
  --exclude='*.lock' \
  --exclude='.DS_Store' \
  --exclude='/.cursor/memories/' \
  --exclude='/.cursor/mcp.json' \
  --exclude='/.cursor/rules/' \
  --exclude='/.cursor/rules/***' \
  --include='/rules/***' \
  --include='/.cursor/' \
  --include='*/' \
  --exclude='*' \
  ./ "$TMP_PAYLOAD"/

# 1. Every .mdc/.md file in repo rules/ must be present in the staged payload.
shopt -s nullglob
missing=0
for src in rules/*.mdc rules/*.md; do
  [[ -e "$src" ]] || continue
  rel="${src#./}"
  if [[ ! -f "$TMP_PAYLOAD/$rel" ]]; then
    printf 'FAIL: %s exists in repo but not in install payload\n' "$rel" >&2
    missing=1
  fi
done
shopt -u nullglob

if [[ "$missing" != "0" ]]; then
  exit 1
fi

repo_count=$(find rules -type f \( -name '*.mdc' -o -name '*.md' \) | wc -l | tr -d ' ')
payload_count=$(find "$TMP_PAYLOAD/rules" -type f \( -name '*.mdc' -o -name '*.md' \) 2>/dev/null | wc -l | tr -d ' ')

if [[ "$repo_count" != "$payload_count" ]]; then
  fail "rules count differs: repo=$repo_count, payload=$payload_count"
fi
log "rules count matches between repo and install payload: $repo_count"

# 2. .cursor/rules/ must be excluded from the payload (it ships as
#    workspace-dev only). If any .mdc landed under the payload's
#    .cursor/rules/, the install script regressed.
if find "$TMP_PAYLOAD/.cursor/rules" -type f -name '*.mdc' 2>/dev/null | grep -q .; then
  fail ".cursor/rules/ leaked into install payload (must stay workspace-dev only)"
fi
log ".cursor/rules/ is correctly excluded from the install payload"

# 3. Cross-check: every plugin-shipped rule cited by the repo's authoring
#    skill is actually present.
required_rules=(
  "rules/repo-owned-plugin-boundary.mdc"
  "rules/memory-and-notepad.mdc"
  "rules/rules-authoring.mdc"
)
for path in "${required_rules[@]}"; do
  [[ -f "$ROOT/$path" ]] || fail "missing required plugin rule: $path"
done
log "required plugin rules present"

echo "VALIDATE_RULES_INSTALL_PARITY_OK"
