#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_AGENT_SMOKE="${RUN_CURSOR_AGENT_SMOKE:-0}"
SKIP_AUTH_CHECK="${CURSOR_SMOKE_SKIP_AUTH_CHECK:-0}"
TIMEOUT_SECONDS="${CURSOR_SMOKE_TIMEOUT:-120}"

usage() {
  cat <<'USAGE'
Usage: scripts/smoke-cursor-agent.sh [--root PATH] [--run-agent-prompt] [--skip-auth-check]

Runs direct, CLI-first Cursor smoke checks:
  - cursor-agent presence
  - default auth availability (environment-gated runtime proof)
  - configured default model availability (environment-gated runtime proof)
  - optional constrained model-backed prompt smoke using the configured model
  - optional constrained repo task smoke using the configured model

Set RUN_CURSOR_AGENT_SMOKE=1 or pass --run-agent-prompt to run the model-backed
agent smoke. The default mode avoids a network/model request and keeps the
runtime claim bounded.

Set CURSOR_SMOKE_SKIP_AUTH_CHECK=1 or pass --skip-auth-check when a previous
step already verified default auth/model availability and you want to avoid
duplicating that local check.
USAGE
}

while (($#)); do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || { echo "FAIL: --root requires a path" >&2; exit 1; }
      ROOT="$2"
      shift 2
      ;;
    --run-agent-prompt)
      RUN_AGENT_SMOKE=1
      shift
      ;;
    --skip-auth-check)
      SKIP_AUTH_CHECK=1
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

command -v cursor-agent >/dev/null 2>&1 || { echo "FAIL: cursor-agent not found" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "FAIL: python3 not found" >&2; exit 1; }

SMOKE_MODEL="${CURSOR_SMOKE_MODEL:-}"
if [[ -z "$SMOKE_MODEL" ]]; then
  SMOKE_MODEL="$(python3 "$ROOT/scripts/resolve-cursor-model.py")"
fi

run_cursor_prompt() {
  local label="$1"
  local expected="$2"
  local prompt="$3"
  local max_attempts="${CURSOR_SMOKE_RETRY_ATTEMPTS:-3}"
  local attempt output status transient

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    output="$(
      timeout "$TIMEOUT_SECONDS" cursor-agent \
        -p \
        --output-format text \
        --model "$SMOKE_MODEL" \
        --mode ask \
        --trust \
        --workspace "$ROOT" \
        "$prompt" 2>&1
    )"
    status=$?

    if [[ "$status" -eq 0 ]] && printf '%s\n' "$output" | grep -Fxq "$expected"; then
      printf '%s\n' "$output"
      return 0
    fi

    transient=0
    if printf '%s\n' "$output" | grep -Eiq 'Connection lost|Retry attempt|tls handshake eof|stream disconnected|reconnecting|temporarily unavailable'; then
      transient=1
    fi
    if printf '%s\n' "$output" | grep -Fq 'Cannot use this model:' && [[ "$SMOKE_MODEL" != "auto" ]]; then
      printf 'bounded: Cursor rejected smoke model %s during %s; retrying with host-selected auto\n' "$SMOKE_MODEL" "$label" >&2
      SMOKE_MODEL="auto"
      continue
    fi

    if [[ "$attempt" -lt "$max_attempts" && "$transient" -eq 1 ]]; then
      printf 'bounded: transient cursor-agent failure during %s (attempt %s/%s), retrying\n' "$label" "$attempt" "$max_attempts" >&2
      sleep "$attempt"
      continue
    fi

    printf '%s\n' "$output" >&2
    echo "FAIL: cursor-agent ${label} failed" >&2
    exit 1
  done
}

if [[ "$SKIP_AUTH_CHECK" == "1" ]]; then
  printf 'ok: reusing upstream default auth/model proof (environment-gated)\n'
else
  "$ROOT/scripts/check-default-auth.sh" >/dev/null
  printf 'ok: cursor-agent default auth/model proof passes\n'
fi

if [[ "$RUN_AGENT_SMOKE" == "1" ]]; then
  printf 'ok: using Cursor smoke model %s\n' "$SMOKE_MODEL"
  output="$(run_cursor_prompt "prompt smoke" "CURSOR_AGENT_OK" "Do not edit files or run shell commands. Reply with exactly: CURSOR_AGENT_OK")"
  printf '%s\n' "$output" | grep -Fxq 'CURSOR_AGENT_OK' || {
    printf '%s\n' "$output" >&2
    echo "FAIL: cursor-agent prompt smoke missing CURSOR_AGENT_OK" >&2
    exit 1
  }
  printf 'ok: cursor-agent prompt smoke returned CURSOR_AGENT_OK (environment-gated runtime proof)\n'

  task_output="$(run_cursor_prompt "task scenario smoke" "CURSOR_TASK_SCENARIO_OK docs/archive/refinement-priority-map.md docs/archive/plugin-boundary-review.md scripts/validate-plugin-structure.sh" "Without editing files or running write commands, identify the repo's archived refinement priority map doc, archived plugin boundary review doc, and plugin structure validation script. Reply with exactly: CURSOR_TASK_SCENARIO_OK docs/archive/refinement-priority-map.md docs/archive/plugin-boundary-review.md scripts/validate-plugin-structure.sh")"
  printf '%s\n' "$task_output" | grep -Fxq 'CURSOR_TASK_SCENARIO_OK docs/archive/refinement-priority-map.md docs/archive/plugin-boundary-review.md scripts/validate-plugin-structure.sh' || {
    printf '%s\n' "$task_output" >&2
    echo "FAIL: cursor-agent task scenario smoke missing CURSOR_TASK_SCENARIO_OK" >&2
    exit 1
  }
  printf 'ok: cursor-agent task scenario smoke returned CURSOR_TASK_SCENARIO_OK (environment-gated runtime proof)\n'

  task_plan_output="$(run_cursor_prompt "task plan smoke" "CURSOR_TASK_PLAN_OK scripts/validate-plugin-structure.sh repo-owned" "Without editing files or running write commands, a richer plugin claim is proposed. Which validator should be rerun first, and what ownership class must the checked-in repo-root plugin packaging currently keep? Reply with exactly: CURSOR_TASK_PLAN_OK scripts/validate-plugin-structure.sh repo-owned")"
  printf '%s\n' "$task_plan_output" | grep -Fxq 'CURSOR_TASK_PLAN_OK scripts/validate-plugin-structure.sh repo-owned' || {
    printf '%s\n' "$task_plan_output" >&2
    echo "FAIL: cursor-agent task plan smoke missing CURSOR_TASK_PLAN_OK" >&2
    exit 1
  }
  printf 'ok: cursor-agent task plan smoke returned CURSOR_TASK_PLAN_OK (environment-gated runtime proof)\n'

  task_command_output="$(run_cursor_prompt "task command smoke" "CURSOR_TASK_COMMAND_OK A" "Without editing files or running write commands, choose the correct rerun path after a plugin structure change. Option A: ./scripts/validate-plugin-structure.sh && ./scripts/validate-state-contract.sh. Option B: ./scripts/validate-mcp-server-structure.py. Reply with exactly: CURSOR_TASK_COMMAND_OK A")"
  printf '%s\n' "$task_command_output" | grep -Fxq 'CURSOR_TASK_COMMAND_OK A' || {
    printf '%s\n' "$task_command_output" >&2
    echo "FAIL: cursor-agent task command smoke missing CURSOR_TASK_COMMAND_OK" >&2
    exit 1
  }
  printf 'ok: cursor-agent task command smoke returned CURSOR_TASK_COMMAND_OK (environment-gated runtime proof)\n'
else
  printf 'ok: model-backed Cursor smoke skipped; runtime claim remains bounded until enhanced prompt proof is requested\n'
fi

printf 'ok: Cursor CLI smoke validation complete\n'
