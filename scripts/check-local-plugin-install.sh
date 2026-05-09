#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_NAME="oh-my-cursor"
TARGET_ROOT=""
WITH_MCP=0

usage() {
  cat <<'USAGE'
Usage: scripts/check-local-plugin-install.sh [--root PATH] [--target-root PATH] [--name NAME] [--with-mcp]

Runs a CI-safe verification of scripts/install-local-plugin.sh by installing
the repo-root plugin into a temporary local-plugin root in both symlink and
copy modes, then checking the resulting plugin structure.

This script does not touch the real ~/.cursor/plugins/local path unless you
explicitly pass it via --target-root.
USAGE
}

while (($#)); do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || { echo "FAIL: --root requires a path" >&2; exit 1; }
      ROOT="$(cd "$2" && pwd)"
      shift 2
      ;;
    --target-root)
      [[ $# -ge 2 ]] || { echo "FAIL: --target-root requires a path" >&2; exit 1; }
      TARGET_ROOT="$2"
      shift 2
      ;;
    --name)
      [[ $# -ge 2 ]] || { echo "FAIL: --name requires a value" >&2; exit 1; }
      PLUGIN_NAME="$2"
      shift 2
      ;;
    --with-mcp)
      WITH_MCP=1
      shift
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

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

cd "$ROOT"
"$ROOT/scripts/validate-plugin-structure.sh" >/dev/null

cleanup_root=0
if [[ -z "$TARGET_ROOT" ]]; then
  TARGET_ROOT="$(mktemp -d)"
  cleanup_root=1
fi

cleanup() {
  if [[ "$cleanup_root" == "1" ]]; then
    rm -rf "$TARGET_ROOT"
  fi
}
trap cleanup EXIT

SYMLINK_TARGET="${TARGET_ROOT%/}/symlink"
COPY_TARGET="${TARGET_ROOT%/}/copy"

mkdir -p "$COPY_TARGET/oh-my-copilot-workspace"
printf '{"stale": true}\n' > "$COPY_TARGET/oh-my-copilot-workspace/stale.json"

"$ROOT/scripts/install-local-plugin.sh" --target-root "$SYMLINK_TARGET" --name "$PLUGIN_NAME" --symlink --force >/dev/null
plugin_path="${SYMLINK_TARGET}/${PLUGIN_NAME}"
[[ -L "$plugin_path" ]] || fail "symlink mode did not create a symlink at $plugin_path"
[[ "$(readlink "$plugin_path")" == "$ROOT" ]] || fail "symlink mode did not point at $ROOT"
[[ -f "$plugin_path/.cursor-plugin/plugin.json" ]] || fail "symlink mode plugin missing manifest"
log "symlink mode installs the repo-root plugin correctly"

_with_mcp_flag=()
if [[ "$WITH_MCP" == "1" ]]; then
  _with_mcp_flag=(--with-mcp)
fi

"$ROOT/scripts/install-local-plugin.sh" --target-root "$COPY_TARGET" --name "$PLUGIN_NAME" --copy --force "${_with_mcp_flag[@]+"${_with_mcp_flag[@]}"}" >/dev/null
plugin_path="${COPY_TARGET}/${PLUGIN_NAME}"
[[ ! -e "$COPY_TARGET/oh-my-copilot-workspace" ]] || fail "copy mode did not remove legacy oh-my-copilot-workspace alias"
[[ ! -L "$plugin_path" ]] || fail "copy mode unexpectedly created a symlink at $plugin_path"
[[ -d "$plugin_path" ]] || fail "copy mode did not create plugin directory at $plugin_path"
[[ -f "$plugin_path/.cursor-plugin/plugin.json" ]] || fail "copy mode plugin missing manifest"
[[ -f "$plugin_path/assets/oh-my-cursor-character.jpg" ]] || fail "copy mode plugin missing character asset"
[[ -f "$plugin_path/assets/oh-my-cursor-social-preview.jpg" ]] || fail "copy mode plugin missing social preview asset"
[[ -f "$plugin_path/rules/repo-owned-plugin-boundary.mdc" ]] || fail "copy mode plugin missing rule file"
[[ -f "$plugin_path/skills/local-plugin-check/SKILL.md" ]] || fail "copy mode plugin missing skill file"
[[ -f "$plugin_path/skills/phase-controller/SKILL.md" ]] || fail "copy mode plugin missing phase-controller skill"
[[ -f "$plugin_path/hooks.json" ]] || fail "copy mode plugin missing hook manifest"
[[ -d "$plugin_path/hooks" ]] || fail "copy mode plugin missing hooks directory"
[[ -f "$plugin_path/hooks/claim-guard.py" ]] || fail "copy mode plugin missing claim-guard hook"
[[ -f "$plugin_path/hooks/prompt-router.py" ]] || fail "copy mode plugin missing prompt-router hook"
[[ -f "$plugin_path/hooks/shell-guard.py" ]] || fail "copy mode plugin missing shell-guard hook"
[[ -f "$plugin_path/hooks/stop-gate.py" ]] || fail "copy mode plugin missing stop-gate hook"
[[ -f "$plugin_path/hooks/session-bootstrap.py" ]] || fail "copy mode plugin missing session-bootstrap hook"
[[ -f "$plugin_path/hooks/session-summary.py" ]] || fail "copy mode plugin missing session-summary hook"
[[ -f "$plugin_path/hooks/tool-guard.py" ]] || fail "copy mode plugin missing tool-guard hook"
[[ -f "$plugin_path/hooks/state-watcher.py" ]] || fail "copy mode plugin missing state-watcher hook"
[[ -f "$plugin_path/hooks/failure-router.py" ]] || fail "copy mode plugin missing failure-router hook"
[[ -f "$plugin_path/hooks/subagent-bootstrap.py" ]] || fail "copy mode plugin missing subagent-bootstrap hook"
[[ -f "$plugin_path/hooks/subagent-summary.py" ]] || fail "copy mode plugin missing subagent-summary hook"
[[ -f "$plugin_path/hooks/shell-debrief.py" ]] || fail "copy mode plugin missing shell-debrief hook"
[[ -f "$plugin_path/hooks/read-advisor.py" ]] || fail "copy mode plugin missing read-advisor hook"
[[ -f "$plugin_path/hooks/compact-reminder.py" ]] || fail "copy mode plugin missing compact-reminder hook"
[[ -f "$plugin_path/hooks/_trace.py" ]] || fail "copy mode plugin missing _trace helper"
[[ -d "$plugin_path/agents" ]] || fail "copy mode plugin missing agents directory"
[[ -f "$plugin_path/agents/code-reviewer.md" ]] || fail "copy mode plugin missing code-reviewer agent"
[[ -f "$plugin_path/agents/critic.md" ]] || fail "copy mode plugin missing critic agent"
[[ -f "$plugin_path/agents/debugger.md" ]] || fail "copy mode plugin missing debugger agent"
[[ -f "$plugin_path/agents/explore.md" ]] || fail "copy mode plugin missing explore agent"
[[ -f "$plugin_path/agents/implementer.md" ]] || fail "copy mode plugin missing implementer agent"
[[ -f "$plugin_path/agents/orchestrator.md" ]] || fail "copy mode plugin missing orchestrator agent"
[[ -f "$plugin_path/agents/planner.md" ]] || fail "copy mode plugin missing planner agent"
[[ -f "$plugin_path/agents/researcher.md" ]] || fail "copy mode plugin missing researcher agent"
[[ -f "$plugin_path/agents/security-reviewer.md" ]] || fail "copy mode plugin missing security-reviewer agent"
[[ -f "$plugin_path/agents/test-engineer.md" ]] || fail "copy mode plugin missing test-engineer agent"
[[ -f "$plugin_path/agents/tracer.md" ]] || fail "copy mode plugin missing tracer agent"
[[ -f "$plugin_path/agents/verifier.md" ]] || fail "copy mode plugin missing verifier agent"
[[ -d "$plugin_path/.cursor/state" ]] || fail "copy mode plugin missing workflow-state directory"
[[ -f "$plugin_path/.cursor/state/workflow-state.schema.json" ]] || fail "copy mode plugin missing workflow-state schema"
[[ -f "$plugin_path/.cursor/state/workflow-state.py" ]] || fail "copy mode plugin missing workflow-state writer"
[[ ! -d "$plugin_path/benchmark" ]] || fail "copy mode should not include benchmark assets"
[[ ! -d "$plugin_path/apps" ]] || fail "copy mode should not include app assets"
[[ ! -d "$plugin_path/docs" ]] || fail "copy mode should not include docs assets"
[[ ! -d "$plugin_path/scripts" ]] || fail "copy mode should not include scripts assets"
[[ -f "$plugin_path/assets/oh-my-cursor-character.jpg" ]] || fail "copy mode plugin missing character asset"
[[ -f "$plugin_path/assets/oh-my-cursor-social-preview.jpg" ]] || fail "copy mode plugin missing social preview asset"
[[ -f "$plugin_path/.cursor/mcp.example.json" ]] || fail "copy mode plugin missing mcp.example.json"

if [[ "$WITH_MCP" != "1" ]]; then
  [[ ! -d "$plugin_path/mcp" ]] || fail "default install must not include mcp/"
  log "copy mode: mcp/ correctly absent from default install"
else
  [[ -f "$plugin_path/mcp/cursor-state-bridge/server.py" ]] || fail "--with-mcp install missing mcp/cursor-state-bridge/server.py"
  [[ -f "$plugin_path/mcp/cursor-state-bridge/__main__.py" ]] || fail "--with-mcp install missing mcp/cursor-state-bridge/__main__.py"
  log "copy mode: mcp/cursor-state-bridge correctly present with --with-mcp"
fi

log "copy mode installs the repo-root plugin correctly"

log "local plugin install helper passed bounded install checks"
