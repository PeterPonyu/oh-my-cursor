#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_NAME="oh-my-cursor"
TARGET_ROOT="${HOME}/.cursor/plugins/local"
MODE="copy"
FORCE=0
WITH_MCP=0
ACTION="install"
LEGACY_PLUGIN_NAMES=("oh-my-copilot-workspace")

usage() {
  cat <<'USAGE'
Usage: scripts/install-local-plugin.sh [ACTION] [--root PATH] [--target-root PATH] [--name NAME] [--copy|--symlink] [--force] [--with-mcp]

Installs a Cursor plugin source tree into Cursor's local plugin directory.

Defaults:
  - mode: copy (minimal runtime payload only)
  - target root: ~/.cursor/plugins/local
  - plugin name: oh-my-cursor

The source root passed via --root may point at either:
  - the repository root, or
  - a prebuilt minimal payload such as dist/oh-my-cursor

This script validates the source root first, then either:
  - creates/refreshes a symlink, or
  - copies only the minimal runtime plugin payload into the local plugin directory.

It does not reload Cursor for you; the final reload remains a manual product action.

Actions:
  --status     Show installed plugin info (version, mode, file count, staleness)
  --uninstall   Remove the plugin and any legacy aliases from the target root
  --watch      Watch for changes and auto-re-copy the payload (copy mode only)

Flags:
  --with-mcp   Also copy the mcp/ tree (default: omitted from minimal payload)
  --force      Replace an existing install without prompting
  --copy       Use copy mode (default)
  --symlink    Use symlink mode (live repo changes visible after Cursor reload)
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
    --copy)
      MODE="copy"
      shift
      ;;
    --symlink)
      MODE="symlink"
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --with-mcp)
      WITH_MCP=1
      shift
      ;;
    --status)
      ACTION="status"
      shift
      ;;
    --uninstall)
      ACTION="uninstall"
      shift
      ;;
    --watch)
      ACTION="watch"
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

validate_prebuilt_payload() {
  local src="$1"
  local manifest="${src%/}/.cursor-plugin/plugin.json"
  [[ -f "$manifest" ]] || fail "prebuilt payload is missing .cursor-plugin/plugin.json"

  python3 - "$manifest" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)

missing = [
    key for key in ("name", "displayName", "version")
    if not data.get(key)
]
if missing:
    raise SystemExit(
        "manifest missing required fields: " + ", ".join(missing)
    )
PY

  local required_paths=(
    "AGENTS.md"
    "README.md"
    "CHANGELOG.md"
    "LICENSE"
    "assets"
    "rules"
    "skills"
    "agents"
    "hooks/hooks.json"
    "hooks"
    ".cursor/mcp.example.json"
    ".cursor/state"
  )

  local required_path
  for required_path in "${required_paths[@]}"; do
    [[ -e "${src%/}/${required_path}" ]] || fail "prebuilt payload is missing ${required_path}"
  done

  if find "$src" \( -name "__pycache__" -o -name ".pytest_cache" -o -name "*.pyc" -o -name "*.lock" \) -print -quit | grep -q .; then
    fail "prebuilt payload contains dev artifacts (__pycache__, .pytest_cache, *.pyc, or *.lock)"
  fi

  log "validated prebuilt plugin payload at $src"
}

validate_source_root() {
  local src="$1"

  if [[ -f "${src%/}/scripts/validate-plugin-structure.sh" ]]; then
    (cd "$src" && "${src%/}/scripts/validate-plugin-structure.sh" >/dev/null)
    log "validated repo-root plugin structure at $src"
    return 0
  fi

  validate_prebuilt_payload "$src"
}

cleanup_legacy_aliases() {
  local target_root="$1"

  [[ "$PLUGIN_NAME" == "oh-my-cursor" ]] || return 0

  local legacy_name legacy_path
  for legacy_name in "${LEGACY_PLUGIN_NAMES[@]}"; do
    legacy_path="${target_root%/}/${legacy_name}"
    if [[ -e "$legacy_path" || -L "$legacy_path" ]]; then
      rm -rf "$legacy_path"
      log "removed legacy local plugin alias at $legacy_path"
    fi
  done

  # Idempotent cleanup of stale mcp/ from a prior --with-mcp install
  if [[ "$WITH_MCP" != "1" ]]; then
    if [[ -L "${target_root%/}/${PLUGIN_NAME}" ]]; then
      log "skipped stale mcp/ cleanup for symlink install at ${target_root%/}/${PLUGIN_NAME}"
      return 0
    fi
    local stale_mcp="${target_root%/}/${PLUGIN_NAME}/mcp"
    if [[ -d "$stale_mcp" ]]; then
      rm -rf "$stale_mcp"
      log "removed stale mcp/ tree from previous --with-mcp install at $stale_mcp"
    fi
  fi
}

copy_minimal_payload() {
  local src="$1"
  local dst="$2"

  local mcp_includes=()
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
    --include='/hooks/hooks.json' \
    --include='/hooks/***' \
    --include='/agents/***' \
    --include='/.cursor/state/***' \
    --exclude='/.cursor/rules/' \
    --exclude='/.cursor/rules/***' \
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
    "$src"/ "$dst"/

  find "$dst" -type d \( -name "__pycache__" -o -name ".pytest_cache" \) -exec rm -rf {} + 2>/dev/null || true
}

do_status() {
  local target_path="${TARGET_ROOT%/}/${PLUGIN_NAME}"

  if [[ ! -e "$target_path" && ! -L "$target_path" ]]; then
    echo "not installed: $target_path does not exist"
    exit 0
  fi

  local manifest="${target_path}/.cursor-plugin/plugin.json"
  if [[ ! -f "$manifest" ]]; then
    echo "broken install: $target_path exists but is missing .cursor-plugin/plugin.json"
    exit 0
  fi

  local installed_version
  installed_version=$(python3 - "$manifest" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    print(json.load(f).get("version", "unknown"))
PY
  )

  local repo_manifest="${ROOT}/.cursor-plugin/plugin.json"
  local repo_version="unknown"
  if [[ -f "$repo_manifest" ]]; then
    repo_version=$(python3 - "$repo_manifest" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    print(json.load(f).get("version", "unknown"))
PY
    )
  fi

  local mode="copy"
  if [[ -L "$target_path" ]]; then
    mode="symlink ($(readlink "$target_path"))"
  fi

  local file_count
  file_count=$(find "$target_path" -type f 2>/dev/null | wc -l | tr -d ' ')

  local stale=""
  if [[ "$installed_version" != "$repo_version" ]]; then
    stale=" (stale: repo has $repo_version)"
  fi

  echo "installed: $target_path"
  echo "  version: $installed_version${stale}"
  echo "  mode:    $mode"
  echo "  files:   $file_count"
}

do_uninstall() {
  local target_path="${TARGET_ROOT%/}/${PLUGIN_NAME}"

  if [[ ! -e "$target_path" && ! -L "$target_path" ]]; then
    log "nothing to uninstall at $target_path"
    return 0
  fi

  rm -rf "$target_path"
  log "removed plugin at $target_path"

  cleanup_legacy_aliases "$TARGET_ROOT"
}

do_watch() {
  if [[ "$MODE" == "symlink" ]]; then
    fail "--watch requires copy mode; symlink mode already reflects repo changes live"
  fi

  local watch_tool=""
  if command -v inotifywait >/dev/null 2>&1; then
    watch_tool="inotifywait"
  elif command -v fswatch >/dev/null 2>&1; then
    watch_tool="fswatch"
  else
    fail "--watch requires inotifywait (Linux) or fswatch (macOS); neither was found"
  fi

  # Perform initial install
  FORCE=1
  # Fall through to the normal install logic below, then loop
  TARGET_PATH="${TARGET_ROOT%/}/${PLUGIN_NAME}"
  mkdir -p "$TARGET_ROOT"
  cleanup_legacy_aliases "$TARGET_ROOT"
  rm -rf "$TARGET_PATH"
  mkdir -p "$TARGET_PATH"
  copy_minimal_payload "$ROOT" "$TARGET_PATH"
  log "initial install complete — watching for changes ($watch_tool)"

  local debounce_pid=""
  debounce_reinstall() {
    # Wait 0.5s for additional events before re-installing
    if [[ -n "$debounce_pid" ]] && kill -0 "$debounce_pid" 2>/dev/null; then
      return 0
    fi
    (
      sleep 0.5
      rm -rf "$TARGET_PATH"
      mkdir -p "$TARGET_PATH"
      copy_minimal_payload "$ROOT" "$TARGET_PATH"
      printf 'Re-copied payload — reload Cursor to see changes\n'
    ) &
    debounce_pid=$!
  }

  cleanup() {
    if [[ -n "$debounce_pid" ]] && kill -0 "$debounce_pid" 2>/dev/null; then
      kill "$debounce_pid" 2>/dev/null || true
    fi
    printf '\nStopped watching.\n'
    exit 0
  }
  trap cleanup INT TERM

  if [[ "$watch_tool" == "inotifywait" ]]; then
    inotifywait -r -e modify,create,delete,move \
      --exclude='(__pycache__|\.pytest_cache|\.git|\.omc|\.omcs|\.cursor-worktree|\.sisyphus|node_modules)' \
      "$ROOT" 2>/dev/null | while read -r _; do
      debounce_reinstall
    done
  else
    # fswatch: cross-platform, prints one path per event
    fswatch -r --exclude='(__pycache__|\.pytest_cache|\.git|\.omc|\.omcs|\.cursor-worktree|\.sisyphus|node_modules)' \
      "$ROOT" 2>/dev/null | while read -r _; do
      debounce_reinstall
    done
  fi
}

cd "$ROOT"

if [[ "$ACTION" == "status" ]]; then
  validate_source_root "$ROOT"
  do_status
  exit 0
fi

if [[ "$ACTION" == "uninstall" ]]; then
  do_uninstall
  exit 0
fi

if [[ "$ACTION" == "watch" ]]; then
  validate_source_root "$ROOT"
  if [[ "$WITH_MCP" == "1" ]] && [[ ! -d "${ROOT%/}/mcp" ]]; then
    fail "--with-mcp requested but source root has no mcp/ tree; rebuild with scripts/build-dist.sh --with-mcp or install from the repo root"
  fi
  do_watch
  exit 0
fi

validate_source_root "$ROOT"

if [[ "$WITH_MCP" == "1" ]] && [[ ! -d "${ROOT%/}/mcp" ]]; then
  fail "--with-mcp requested but source root has no mcp/ tree; rebuild with scripts/build-dist.sh --with-mcp or install from the repo root"
fi

TARGET_PATH="${TARGET_ROOT%/}/${PLUGIN_NAME}"
mkdir -p "$TARGET_ROOT"
cleanup_legacy_aliases "$TARGET_ROOT"

if [[ -e "$TARGET_PATH" || -L "$TARGET_PATH" ]]; then
  if [[ "$FORCE" != "1" ]]; then
    if [[ -L "$TARGET_PATH" ]] && [[ "$(readlink "$TARGET_PATH")" == "$ROOT" ]]; then
      log "local plugin path already points at this repository: $TARGET_PATH"
    else
      fail "target already exists at $TARGET_PATH (use --force to replace it)"
    fi
  fi
fi

if [[ "$MODE" == "symlink" ]]; then
  if [[ "$FORCE" == "1" ]]; then
    rm -rf "$TARGET_PATH"
  fi
  ln -sfn "$ROOT" "$TARGET_PATH"
  log "symlinked plugin into $TARGET_PATH"
else
  if [[ "$FORCE" == "1" ]]; then
    rm -rf "$TARGET_PATH"
  fi
  mkdir -p "$TARGET_PATH"
  copy_minimal_payload "$ROOT" "$TARGET_PATH"
  log "copied minimal runtime plugin payload into $TARGET_PATH"
fi

[[ -f "$TARGET_PATH/.cursor-plugin/plugin.json" ]] || fail "installed plugin is missing .cursor-plugin/plugin.json"
log "installed plugin root contains .cursor-plugin/plugin.json"

cat <<EOF
next: reload Cursor or use Developer: Reload Window
next: confirm rules/skills/hooks/agents are visible from ${TARGET_PATH}
EOF
