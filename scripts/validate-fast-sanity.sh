#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: scripts/validate-fast-sanity.sh [--root PATH]

Fast deterministic oh-my-cursor sanity gate. It avoids live Cursor/model calls
and checks shell syntax, plugin/config validators, hooks, workflow-state, MCP
bridge structure, and the structural E2E fixture.
USAGE
}

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

while (($#)); do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || fail "--root requires a path"
      ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

ROOT="$(cd "$ROOT" && pwd)"
cd "$ROOT"

find scripts -type f -name '*.sh' -print0 | sort -z | xargs -0 -r -n 1 bash -n
log "shell wrappers parse with bash -n"

node --experimental-strip-types scripts/validate-plugin-structure.ts
node --experimental-strip-types scripts/validate-mcp-config.ts
node --experimental-strip-types scripts/validate-cursor-workflow-artifacts.ts
node --experimental-strip-types scripts/validate-workflow-state.ts
node --experimental-strip-types scripts/validate-hook-readonly.ts
node --experimental-strip-types scripts/validate-mcp-server-structure.ts
node --experimental-strip-types scripts/smoke-cursor-workflow-artifacts.ts
node --experimental-strip-types scripts/smoke-workflow-state-completion.ts
./scripts/validate-structural-e2e.sh --root "$ROOT"

log "fast sanity validation complete"
