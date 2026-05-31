#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEEP_TMP=0

usage() {
  cat <<'USAGE'
Usage: scripts/validate-structural-e2e.sh [--root PATH] [--keep-tmp]

Runs a credential-free structural E2E fixture for oh-my-cursor:
  - installs the local plugin into an isolated temp Cursor plugin root
  - exercises installed hook scripts against synthetic Cursor envelopes
  - validates workflow-state hook behavior in an isolated workspace
  - starts the copied cursor-state-bridge MCP server and lists tools
  - writes a validation summary in the temp workspace
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
    --keep-tmp)
      KEEP_TMP=1
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

tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/omc-structural-e2e.XXXXXX")"
if [[ "$KEEP_TMP" != "1" ]]; then
  trap 'rm -rf "$tmp_root"' EXIT
else
  printf 'tmp: %s\n' "$tmp_root"
fi

workspace="$tmp_root/workspace"
home_dir="$tmp_root/home"
plugin_root="$tmp_root/cursor-plugins"
plugin_dir="$plugin_root/oh-my-cursor"
mkdir -p "$workspace/.cursor/state" "$home_dir" "$plugin_root"
cp "$ROOT/.cursor/state/workflow-state.schema.json" "$workspace/.cursor/state/workflow-state.schema.json"
cat > "$workspace/notepad.md" <<'NOTE'
# notepad

<!-- OMCS:NOTEPAD:PRIORITY -->
<!-- /OMCS:NOTEPAD:PRIORITY -->

<!-- OMCS:NOTEPAD:WORKING -->
<!-- /OMCS:NOTEPAD:WORKING -->

<!-- OMCS:NOTEPAD:MANUAL -->
<!-- /OMCS:NOTEPAD:MANUAL -->
NOTE
cat > "$workspace/project-memory.json" <<'JSON'
{"directives":[]}
JSON

HOME="$home_dir" node --experimental-strip-types scripts/install-local-plugin.ts \
  --root "$ROOT" \
  --target-root "$plugin_root" \
  --name oh-my-cursor \
  --copy \
  --force \
  --with-mcp >"$tmp_root/install-local-plugin.out"
[[ -f "$plugin_dir/.cursor-plugin/plugin.json" ]] || fail "installed plugin missing manifest"
[[ -f "$plugin_dir/hooks/hooks.json" ]] || fail "installed plugin missing hooks manifest"
[[ -f "$plugin_dir/mcp/cursor-state-bridge/index.ts" ]] || fail "installed plugin missing MCP bridge"
log "local plugin installs into isolated Cursor plugin root with MCP payload"

run_hook() {
  local script="$1"
  local payload="$2"
  local output
  output="$(cd "$workspace" && HOME="$home_dir" OH_MY_CURSOR_WORKSPACE="$workspace" node --experimental-strip-types "$plugin_dir/$script" <<<"$payload")"
  node -e 'JSON.parse(process.argv[1])' "$output" >/dev/null
}

run_hook hooks/session-bootstrap.ts '{"event":"sessionStart","session_id":"e2e","is_background_agent":false,"composer_mode":"agent"}'
run_hook hooks/shell-guard.ts '{"event":"beforeShellExecution","command":"git status --short"}'
run_hook hooks/tool-guard.ts '{"event":"preToolUse","tool_name":"Edit","tool_input":{"file_path":"README.md"}}'
run_hook hooks/prompt-router.ts '{"event":"beforeSubmitPrompt","prompt":"please verify workflow-state and MCP bridge"}'
log "installed hook scripts accept synthetic Cursor envelopes"

node --experimental-strip-types "$plugin_dir/.cursor/state/workflow-state.ts" \
  init "$workspace/.cursor/state/workflow-state.json" \
  --task-id structural-e2e \
  --title "structural E2E" \
  --phase verify \
  --status in_progress \
  --role verifier \
  --next-action "validate installed hooks" >"$tmp_root/workflow-state-init.out"
run_hook hooks/state-watcher.ts "{\"event\":\"postToolUse\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$workspace/.cursor/state/workflow-state.json\"},\"tool_output\":\"ok\"}"
log "installed workflow-state helper and state-watcher validate isolated state"

node --input-type=module - "$plugin_dir" "$workspace" <<'NODE'
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const [pluginDir, workspace] = process.argv.slice(2);
const proc = spawn('node', ['--experimental-strip-types', `${pluginDir}/mcp/cursor-state-bridge/index.ts`, '--workspace', workspace], {
  stdio: ['pipe', 'pipe', 'inherit'],
});
function send(req) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: proc.stdout, terminal: false });
    rl.once('line', line => {
      try { resolve(JSON.parse(line.trim())); }
      catch (err) { reject(new Error(`bad JSON-RPC response: ${line}`)); }
      finally { rl.close(); }
    });
    proc.stdin.write(JSON.stringify(req) + '\n');
  });
}
try {
  const init = await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  if (!init.result) throw new Error(`initialize failed: ${JSON.stringify(init)}`);
  const listed = await send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const tools = listed.result?.tools ?? [];
  if (tools.length !== 11) throw new Error(`expected 11 MCP tools, got ${tools.length}`);
  if (!tools.some(t => t.name === 'memory_wiki_log_append')) throw new Error('missing memory tool from installed bridge');
  console.log('ok: installed MCP bridge lists expected workflow-state and memory tools');
} finally {
  proc.stdin.end();
}
NODE

summary="$workspace/.cursor/state/structural-e2e-summary.md"
cat > "$summary" <<EOF_SUMMARY
# oh-my-cursor structural E2E summary

- workspace: $workspace
- home: $home_dir
- plugin_dir: $plugin_dir
- plugin_install: PASS
- hooks: PASS
- workflow_state: PASS
- mcp_bridge: PASS
EOF_SUMMARY
[[ -s "$summary" ]] || fail "validation summary was not written"
log "structural E2E summary written to ${summary#$workspace/}"
log "structural E2E validation complete"
