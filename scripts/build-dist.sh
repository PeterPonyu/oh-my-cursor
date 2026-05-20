#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_NAME="oh-my-cursor"
DIST_DIR="${ROOT}/dist"
WITH_MCP=0

usage() {
  cat <<'USAGE'
Usage: scripts/build-dist.sh [--with-mcp] [--clean]

Builds a clean distribution payload into dist/.

This script:
  1. Validates the plugin structure
  2. Removes any stale dist/ directory
  3. Copies only the minimal runtime payload (no dev artifacts)
  4. Optionally includes the MCP server

Flags:
  --with-mcp  Include the mcp/ tree in the payload
  --clean     Remove dist/ and exit without building
USAGE
}

while (($#)); do
  case "$1" in
    --with-mcp)
      WITH_MCP=1
      shift
      ;;
    --clean)
      rm -rf "${DIST_DIR}"
      echo "ok: removed ${DIST_DIR}"
      exit 0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "FAIL: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

cd "$ROOT"

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

bash scripts/validate-plugin-structure.sh >/dev/null || fail "plugin structure validation failed"
log "plugin structure validated"

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

mcp_includes=()
if [[ "$WITH_MCP" == "1" ]]; then
  mcp_includes=(--include='/mcp/' --include='/mcp/***' --include='/mcp.json' --exclude='/mcp/**/tests/**' --exclude='/mcp/cursor-state-bridge/tests/')
fi

rsync -a \
  -m \
  --delete \
    --exclude='**/__pycache__/' \
    --exclude='**/.pytest_cache/' \
    --exclude='*.pyc' \
    --exclude='/mcp/**/tests/**' \
    --exclude='/mcp/cursor-state-bridge/tests/' \
  --exclude='*.lock' \
  --exclude='.DS_Store' \
  --exclude='*.swp' \
  --exclude='*~' \
  --exclude='/.cursor/memories/' \
  --exclude='/.cursor/mcp.json' \
  --exclude='/.cursor/state/workflow-state.json' \
  --exclude='/.cursor/state/active-role.json' \
  --exclude='/.cursor/hooks/state/' \
  --include='/.cursor-plugin/***' \
  --include='/.cursor/mcp.example.json' \
  --include='/hooks/***' \
  --include='/agents/***' \
  --include='/.cursor/state/***' \
  --include='/rules/***' \
  --include='/skills/***' \
  --include='/AGENTS.md' \
  --include='/README.md' \
  --include='/assets/***' \
  --include='/CHANGELOG.md' \
    --include='/LICENSE' \
    --include='*/' \
  "${mcp_includes[@]}" \
  --exclude='*' \
  "$ROOT"/ "${DIST_DIR}/${PLUGIN_NAME}"/ || fail "rsync failed"

if find "${DIST_DIR}" -name "__pycache__" -o -name ".pytest_cache" -o -name "*.pyc" -o -name "*.lock" | grep -q .; then
  fail "dist/ contains dev artifacts (__pycache__, .pytest_cache, *.pyc, or *.lock)"
fi

file_count=$(find "${DIST_DIR}/${PLUGIN_NAME}" -type f | wc -l | tr -d ' ')
log "built dist/${PLUGIN_NAME} with ${file_count} files"

if [[ "$WITH_MCP" == "1" ]]; then
  log "mcp/ included in payload"
else
  log "mcp/ excluded (use --with-mcp to include)"
fi

cat <<EOF
next: inspect dist/${PLUGIN_NAME}/
next: install bundled payload with: scripts/install-local-plugin.sh --root dist/${PLUGIN_NAME} --force
EOF
