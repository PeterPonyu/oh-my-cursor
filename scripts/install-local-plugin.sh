#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_NAME="oh-my-cursor"
TARGET_ROOT="${HOME}/.cursor/plugins/local"
MODE="symlink"
FORCE=0

usage() {
  cat <<'USAGE'
Usage: scripts/install-local-plugin.sh [--root PATH] [--target-root PATH] [--name NAME] [--copy|--symlink] [--force]

Installs the repo-root Cursor plugin into Cursor's local plugin directory.

Defaults:
  - mode: symlink
  - target root: ~/.cursor/plugins/local
  - plugin name: oh-my-cursor

This script validates the checked-in plugin structure first, then either:
  - creates/refreshes a symlink, or
  - copies the plugin files into the local plugin directory.

It does not reload Cursor for you; the final reload remains a manual product action.
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

TARGET_PATH="${TARGET_ROOT%/}/${PLUGIN_NAME}"
mkdir -p "$TARGET_ROOT"

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
  rsync -a \
    --delete \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude '.omx/team/' \
    --exclude '.omx/state/team/' \
    "$ROOT"/ "$TARGET_PATH"/
  log "copied plugin into $TARGET_PATH"
fi

[[ -f "$TARGET_PATH/.cursor-plugin/plugin.json" ]] || fail "installed plugin is missing .cursor-plugin/plugin.json"
log "installed plugin root contains .cursor-plugin/plugin.json"

cat <<EOF
next: reload Cursor or use Developer: Reload Window
next: confirm the plugin-owned rule and skill are visible from ${TARGET_PATH}
EOF
