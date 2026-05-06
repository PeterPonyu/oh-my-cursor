#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_NAME="oh-my-cursor"
TARGET_ROOT=""

usage() {
  cat <<'USAGE'
Usage: scripts/check-local-plugin-install.sh [--root PATH] [--target-root PATH] [--name NAME]

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

"$ROOT/scripts/install-local-plugin.sh" --target-root "$SYMLINK_TARGET" --name "$PLUGIN_NAME" --symlink --force >/dev/null
plugin_path="${SYMLINK_TARGET}/${PLUGIN_NAME}"
[[ -L "$plugin_path" ]] || fail "symlink mode did not create a symlink at $plugin_path"
[[ "$(readlink "$plugin_path")" == "$ROOT" ]] || fail "symlink mode did not point at $ROOT"
[[ -f "$plugin_path/.cursor-plugin/plugin.json" ]] || fail "symlink mode plugin missing manifest"
log "symlink mode installs the repo-root plugin correctly"

"$ROOT/scripts/install-local-plugin.sh" --target-root "$COPY_TARGET" --name "$PLUGIN_NAME" --copy --force >/dev/null
plugin_path="${COPY_TARGET}/${PLUGIN_NAME}"
[[ ! -L "$plugin_path" ]] || fail "copy mode unexpectedly created a symlink at $plugin_path"
[[ -d "$plugin_path" ]] || fail "copy mode did not create plugin directory at $plugin_path"
[[ -f "$plugin_path/.cursor-plugin/plugin.json" ]] || fail "copy mode plugin missing manifest"
[[ -f "$plugin_path/rules/repo-owned-plugin-boundary.mdc" ]] || fail "copy mode plugin missing rule file"
[[ -f "$plugin_path/skills/local-plugin-check/SKILL.md" ]] || fail "copy mode plugin missing skill file"
[[ -f "$plugin_path/skills/phase-controller/SKILL.md" ]] || fail "copy mode plugin missing phase-controller skill"
[[ -f "$plugin_path/.cursor/hooks.json" ]] || fail "copy mode plugin missing hook manifest"
[[ -d "$plugin_path/.cursor/hooks" ]] || fail "copy mode plugin missing hooks directory"
[[ -f "$plugin_path/.cursor/hooks/claim-guard.py" ]] || fail "copy mode plugin missing claim-guard hook"
[[ -f "$plugin_path/.cursor/hooks/stop-gate.py" ]] || fail "copy mode plugin missing stop-gate hook"
[[ -d "$plugin_path/.cursor/agents" ]] || fail "copy mode plugin missing agents directory"
[[ -f "$plugin_path/.cursor/agents/planner.md" ]] || fail "copy mode plugin missing planner agent"
[[ -f "$plugin_path/.cursor/agents/researcher.md" ]] || fail "copy mode plugin missing researcher agent"
[[ -d "$plugin_path/.cursor/state" ]] || fail "copy mode plugin missing workflow-state directory"
[[ -f "$plugin_path/.cursor/state/workflow-state.schema.json" ]] || fail "copy mode plugin missing workflow-state schema"
[[ ! -d "$plugin_path/benchmark" ]] || fail "copy mode should not include benchmark assets"
[[ ! -d "$plugin_path/apps" ]] || fail "copy mode should not include app assets"
[[ ! -d "$plugin_path/docs" ]] || fail "copy mode should not include docs assets"
[[ ! -d "$plugin_path/scripts" ]] || fail "copy mode should not include scripts assets"
log "copy mode installs the repo-root plugin correctly"

log "local plugin install helper passed bounded install checks"
