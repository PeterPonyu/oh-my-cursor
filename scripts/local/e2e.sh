#!/usr/bin/env bash
# scripts/local/e2e.sh — tiered E2E harness for oh-my-cursor
# Tiers: structural (credential-free) | headless (free, no model) | real (model-backed, wired but NOT run here)
# Usage:
#   OMCS_E2E_STRUCTURAL=1 bash scripts/local/e2e.sh   # structural only
#   OMCS_E2E_HEADLESS=1   bash scripts/local/e2e.sh   # structural + headless
#   OMCS_E2E_REAL=1       bash scripts/local/e2e.sh   # full real journey (requires CURSOR_API_KEY)
set -euo pipefail

# ---------------------------------------------------------------------------
# Tier flags — accept both OMCS_ and legacy OMX_ prefix for compatibility
# ---------------------------------------------------------------------------
: "${OMCS_E2E_STRUCTURAL:=${OMX_E2E_STRUCTURAL:-0}}"
: "${OMCS_E2E_HEADLESS:=${OMX_E2E_HEADLESS:-0}}"
: "${OMCS_E2E_REAL:=${OMX_E2E_REAL:-0}}"

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_DIR="${OMCS_EVIDENCE_DIR:-$ROOT/.omcs/evidence}"
mkdir -p "$EVIDENCE_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$EVIDENCE_DIR/e2e-${TIMESTAMP}.log"
touch "$LOG"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() {
  local msg="$*"
  printf '%s  %s\n' "$(date -u +%H:%M:%SZ)" "$msg" | tee -a "$LOG"
}

fail() {
  local msg="$*"
  log "[OMCS] e2e failed — $msg"
  printf '[OMCS] e2e failed\n' >&2
  exit 1
}

# write_result <tier> [journey] [passed_override]
# Emits canonical result JSON to $EVIDENCE_DIR/e2e-result.json (last run wins).
write_result() {
  local tier="$1"
  local journey="${2:-}"
  local passed="${3:-true}"
  local result_file="$EVIDENCE_DIR/e2e-result.json"

  # Default journey from contract
  if [[ -z "$journey" ]]; then
    journey="intake -> research -> plan -> execute -> verify -> review (real model)"
  fi

  cat > "$result_file" <<EOF
{
  "tier": "${tier}",
  "host": "cursor-agent",
  "journey": "${journey}",
  "passed": ${passed},
  "evidence_paths": ["${LOG}"],
  "marker": "[OMCS] e2e passed (tier=${tier})"
}
EOF
  log "result written → $result_file"
}

# ---------------------------------------------------------------------------
# STRUCTURAL TIER — credential-free; always runs first
# ---------------------------------------------------------------------------
log "=== structural tier ==="
bash "$ROOT/scripts/validate-structural-e2e.sh" 2>&1 | tee -a "$LOG" || fail "structural validation failed"

if [[ "$OMCS_E2E_STRUCTURAL" == "1" ]]; then
  write_result "structural" "intake -> research -> plan -> execute -> verify -> review (real model)" "true"
  log "[OMCS] structural e2e passed (tier=structural)"
  exit 0
fi

# ---------------------------------------------------------------------------
# HEADLESS TIER — free; no model call; proves host reachability + plugin install
# ---------------------------------------------------------------------------
log "=== headless tier (no model) ==="

# Verify cursor-agent is on PATH
if ! command -v cursor-agent >/dev/null 2>&1; then
  fail "cursor-agent not found on PATH — install cursor-agent to run the headless tier"
fi
cursor-agent --version 2>&1 | tee -a "$LOG" || fail "cursor-agent --version failed"
log "cursor-agent reachable on PATH"

# Install plugin into isolated temp target root (free file-copy only)
tmp_headless="$(mktemp -d "${TMPDIR:-/tmp}/omcs-headless-e2e.XXXXXX")"
trap 'rm -rf "$tmp_headless"' EXIT
tmp_plugin_root="$tmp_headless/cursor-plugins"
mkdir -p "$tmp_plugin_root"

log "installing plugin into isolated temp root: $tmp_plugin_root"
node --experimental-strip-types "$ROOT/scripts/install-local-plugin.ts" \
  --root "$ROOT" \
  --target-root "$tmp_plugin_root" \
  --name oh-my-cursor \
  --copy \
  --force \
  --with-mcp 2>&1 | tee -a "$LOG" || fail "plugin install into temp root failed"

expected_plugin_dir="$tmp_plugin_root/oh-my-cursor"
[[ -d "$expected_plugin_dir" ]] || fail "expected plugin dir not found after install: $expected_plugin_dir"
[[ -f "$expected_plugin_dir/.cursor-plugin/plugin.json" ]] || fail "plugin manifest missing in installed dir"
log "plugin install dir exists and contains manifest: $expected_plugin_dir"

if [[ "$OMCS_E2E_HEADLESS" == "1" && "$OMCS_E2E_REAL" != "1" ]]; then
  write_result "headless" "install + host reachability (no model)" "true"
  log "[OMCS] e2e passed (tier=headless)"
  exit 0
fi

# ---------------------------------------------------------------------------
# REAL TIER — model-backed; WIRED but NOT run in safe-local mode
# Requires CURSOR_API_KEY; validated in the outward batch (consumes quota).
# ---------------------------------------------------------------------------
run_real_journey() {
  log "=== real journey tier ==="

  # Temporary isolated HOME + workspace (git-tracked files only)
  tmp_real="$(mktemp -d "${TMPDIR:-/tmp}/omcs-real-e2e.XXXXXX")"
  real_journey_ok=0

  # Cleanup runs whether the function returns normally or fail() exits the
  # script (fail uses `exit`, so RETURN alone would not fire on failure —
  # register EXIT too). On FAILURE, best-effort copy the temp dir's evidence
  # into a postmortem dir under $EVIDENCE_DIR; then ALWAYS remove $tmp_real
  # (no leak, success or failure). The guard + rm -rf make it idempotent.
  #
  # NOTE: this EXIT trap supersedes the headless tier's `rm -rf $tmp_headless`
  # EXIT trap, so this cleanup also removes $tmp_headless to avoid leaking it.
  cleanup_real_journey() {
    if [[ -n "${tmp_real:-}" && -d "${tmp_real}" && "${real_journey_ok}" != "1" ]]; then
      local postmortem="$EVIDENCE_DIR/real-postmortem-$TIMESTAMP"
      mkdir -p "$postmortem" 2>/dev/null || true
      # Capture the workflow-state evidence if present; else the whole tree.
      if [[ -f "$tmp_real/workspace/.cursor/state/workflow-state.json" ]]; then
        cp -a "$tmp_real/workspace/.cursor/state/." "$postmortem/" 2>/dev/null || true
      else
        cp -a "$tmp_real/." "$postmortem/" 2>/dev/null || true
      fi
      log "real journey failed — best-effort postmortem copied to $postmortem"
    fi
    [[ -n "${tmp_real:-}" ]] && rm -rf "$tmp_real"
    [[ -n "${tmp_headless:-}" ]] && rm -rf "$tmp_headless"
    return 0
  }
  trap cleanup_real_journey RETURN EXIT

  ws="$tmp_real/workspace"
  mkdir -p "$ws"

  log "copying repo (tracked files) into isolated workspace: $ws"
  # Run the cd+ls-files in a subshell so the harness cwd is not mutated.
  (cd "$ROOT" && git ls-files -z | tar --null -T - -cf -) | tar -xf - -C "$ws"

  log "installing plugin (with MCP) into workspace plugin root"
  local ws_plugin_root="$tmp_real/cursor-plugins"
  mkdir -p "$ws_plugin_root"
  node --experimental-strip-types "$ROOT/scripts/install-local-plugin.ts" \
    --root "$ROOT" \
    --target-root "$ws_plugin_root" \
    --name oh-my-cursor \
    --copy \
    --force \
    --with-mcp 2>&1 | tee -a "$LOG" || fail "plugin install for real journey failed"

  local plugin_dir="$ws_plugin_root/oh-my-cursor"
  [[ -d "$plugin_dir" ]] || fail "plugin dir missing for real journey"

  # ---- Register the cursor-state-bridge MCP for the headless run ----------
  # cursor-agent discovers MCP servers from <workspace>/.cursor/mcp.json (or
  # ~/.cursor/mcp.json) — NOT from the repo-root mcp.json. The bridge entry
  # and its workflow_state library are git-tracked, so both were copied into
  # $ws above; point the config at the bridge inside $ws using absolute paths
  # (headless cursor-agent does not expand the ${workspaceFolder} token).
  local bridge_entry="$ws/mcp/cursor-state-bridge/index.ts"
  [[ -f "$bridge_entry" ]] || fail "state-bridge entry missing in workspace: $bridge_entry"
  mkdir -p "$ws/.cursor"
  cat > "$ws/.cursor/mcp.json" <<EOF
{
  "mcpServers": {
    "cursor-state-bridge": {
      "command": "node",
      "args": ["--experimental-strip-types", "${bridge_entry}", "--workspace", "${ws}"]
    }
  }
}
EOF
  log "wrote workspace MCP config: $ws/.cursor/mcp.json"

  # Approve the bridge and confirm it is 'ready' BEFORE spending model quota.
  ( cd "$ws" && cursor-agent mcp enable cursor-state-bridge ) 2>&1 | tee -a "$LOG" || true
  log "MCP servers visible to cursor-agent in workspace:"
  ( cd "$ws" && cursor-agent mcp list ) 2>&1 | tee -a "$LOG" || true
  ( cd "$ws" && cursor-agent mcp list 2>/dev/null ) | grep -q "cursor-state-bridge: ready" \
    || fail "cursor-state-bridge MCP not 'ready' before real journey (check $ws/.cursor/mcp.json)"
  log "cursor-state-bridge MCP registered and ready"

  # Invoke cursor-agent headless with the full lifecycle prompt.
  # Requires CURSOR_API_KEY in environment.
  # NOTE: agent (executing) mode — NOT ask/plan — so MCP tool calls actually
  # run. --force auto-approves tool calls; --approve-mcps auto-approves the
  # MCP server. The prompt restricts the agent to MCP state tools only (no
  # file edits / no shell) and pins task_id so the state file path is
  # deterministic.
  log "invoking cursor-agent headless for full lifecycle journey (agent mode, MCP state tools)"
  ( cd "$ws" && cursor-agent -p \
    --output-format text \
    --model auto \
    --force \
    --trust \
    --workspace "$ws" \
    --plugin-dir "$plugin_dir" \
    --approve-mcps \
    'You have the cursor-state-bridge MCP tools available (state_init, state_set_phase, state_history_append, etc.). Drive the full software lifecycle for this trivial task: add a /healthz endpoint that returns 200 OK. Do NOT edit any files and do NOT run any shell commands — use ONLY the workflow-state MCP tools, and pass task_id "healthz" on every call. Do exactly this: call state_init with task_id="healthz" and phase="intake"; then call state_set_phase with task_id="healthz" once for each remaining phase in order: research, then plan, then execute, then verify, then review. Stop immediately after recording the review phase.' ) \
    2>&1 | tee -a "$LOG" || fail "cursor-agent real journey invocation failed"

  # ---- Locate the workflow-state evidence ---------------------------------
  # The bridge writes per-task state to docs/plans/<task_id>/workflow-state.json
  # whenever a task_id is supplied. The prompt pins task_id="healthz", so the
  # journey's own state file is deterministic — target it directly. (A bare
  # find under docs/plans would also match pre-existing tracked plans copied
  # into $ws, which carry their own unrelated phase history.) Fall back to the
  # unscoped .cursor/state path only if the per-task file is absent.
  local state_file=""
  if [[ -f "$ws/docs/plans/healthz/workflow-state.json" ]]; then
    state_file="$ws/docs/plans/healthz/workflow-state.json"
  elif [[ -f "$ws/.cursor/state/workflow-state.json" ]]; then
    state_file="$ws/.cursor/state/workflow-state.json"
  fi
  [[ -n "$state_file" && -f "$state_file" ]] \
    || fail "workflow-state.json not found after real journey (searched $ws/docs/plans/healthz and $ws/.cursor/state)"
  log "workflow-state file: $state_file"

  # Parse phases seen: require the full six-phase lifecycle.
  local phases_seen
  phases_seen="$(node -e "
    const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    const seen = new Set((d.history || []).map(h => h.phase));
    if (d.phase) seen.add(d.phase);
    console.log([...seen].join(','));
  " "$state_file" 2>&1)" || fail "failed to parse workflow-state.json: $state_file"

  log "phases seen in workflow-state: $phases_seen"

  for required_phase in intake research plan execute verify review; do
    echo "$phases_seen" | tr ',' '\n' | grep -qx "$required_phase" \
      || fail "real journey: required phase '${required_phase}' not present in workflow-state history (seen: $phases_seen)"
  done

  write_result "real" "intake->research->plan->execute->verify->review" "true"
  log "[OMCS] e2e passed (tier=real)"
  real_journey_ok=1
}

if [[ "$OMCS_E2E_REAL" == "1" ]]; then
  run_real_journey
  exit 0
fi

log "No tier flag set (OMCS_E2E_STRUCTURAL/HEADLESS/REAL). Structural validation completed. Set a tier flag to go further."
