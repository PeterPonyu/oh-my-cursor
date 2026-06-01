#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_MCP_SMOKE=1

usage() {
  cat <<'USAGE'
Usage: scripts/validate-full-local.sh [--root PATH] [--skip-mcp-smoke]

Full credential-free local verification gate for oh-my-cursor. It layers the
fast sanity gate with typecheck, Node tests, repository verify, plugin install
checks, and bounded MCP bridge smoke checks. Live Cursor/model calls are not
required.
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
    --skip-mcp-smoke)
      RUN_MCP_SMOKE=0
      shift
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

./scripts/validate-fast-sanity.sh --root "$ROOT"
npm run typecheck
npm test
npm run verify
node --experimental-strip-types scripts/check-local-plugin-install.ts --root "$ROOT" --with-mcp
node --experimental-strip-types scripts/validate-state-contract.ts
node --experimental-strip-types scripts/validate-mcp-trace.ts
node --experimental-strip-types scripts/validate-prd-ac-mapping.ts
node --experimental-strip-types scripts/test-unified-config.ts
node --experimental-strip-types scripts/test-autopilot-gates.ts

if [[ "$RUN_MCP_SMOKE" == "1" ]]; then
  RUN_MCP_BRIDGE_SMOKE=1 node --experimental-strip-types scripts/smoke-mcp-cursor-state-bridge.ts
  RUN_MCP_BRIDGE_SMOKE=1 node --experimental-strip-types scripts/smoke-mcp-cursor-state-bridge.ts --jail-escape
  RUN_MCP_BRIDGE_SMOKE=1 node --experimental-strip-types scripts/smoke-mcp-cursor-state-bridge.ts --from-example
  RUN_MCP_BRIDGE_SMOKE=1 node --experimental-strip-types scripts/smoke-mcp-cursor-state-bridge.ts --auth
  OH_MY_CURSOR_MCP_TOKEN=structural-token RUN_MCP_BRIDGE_SMOKE=1 node --experimental-strip-types scripts/smoke-mcp-cursor-state-bridge.ts --auth-enforced
else
  log "MCP bridge smoke skipped by flag"
fi

log "full local validation complete"
