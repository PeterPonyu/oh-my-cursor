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
  - auto-model availability (environment-gated runtime proof)
  - optional constrained model-backed prompt smoke using `--model auto`
  - optional constrained repo task smoke using `--model auto`

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

if [[ "$SKIP_AUTH_CHECK" == "1" ]]; then
  printf 'ok: reusing upstream default auth/model proof (environment-gated)\n'
else
  "$ROOT/scripts/check-default-auth.sh" >/dev/null
  printf 'ok: cursor-agent default auth/model proof passes\n'
fi

if [[ "$RUN_AGENT_SMOKE" == "1" ]]; then
  output="$(
    timeout "$TIMEOUT_SECONDS" cursor-agent \
      -p \
      --output-format text \
      --model auto \
      --mode ask \
      --trust \
      --workspace "$ROOT" \
      "Do not edit files or run shell commands. Reply with exactly: CURSOR_AGENT_OK" 2>&1
  )" || {
    printf '%s\n' "$output" >&2
    echo "FAIL: cursor-agent prompt smoke failed" >&2
    exit 1
  }
  printf '%s\n' "$output" | grep -Fxq 'CURSOR_AGENT_OK' || {
    printf '%s\n' "$output" >&2
    echo "FAIL: cursor-agent prompt smoke missing CURSOR_AGENT_OK" >&2
    exit 1
  }
  printf 'ok: cursor-agent prompt smoke returned CURSOR_AGENT_OK (environment-gated runtime proof)\n'

  task_output="$(
    timeout "$TIMEOUT_SECONDS" cursor-agent \
      -p \
      --output-format text \
      --model auto \
      --mode ask \
      --trust \
      --workspace "$ROOT" \
      "Without editing files or running write commands, identify the repo's refinement priority map doc, plugin boundary review doc, and benchmark evidence validator script. Reply with exactly: CURSOR_TASK_SCENARIO_OK docs/refinement-priority-map.md docs/plugin-boundary-review.md scripts/validate-benchmark-evidence.sh" 2>&1
  )" || {
    printf '%s\n' "$task_output" >&2
    echo "FAIL: cursor-agent task scenario smoke failed" >&2
    exit 1
  }
  printf '%s\n' "$task_output" | grep -Fxq 'CURSOR_TASK_SCENARIO_OK docs/refinement-priority-map.md docs/plugin-boundary-review.md scripts/validate-benchmark-evidence.sh' || {
    printf '%s\n' "$task_output" >&2
    echo "FAIL: cursor-agent task scenario smoke missing CURSOR_TASK_SCENARIO_OK" >&2
    exit 1
  }
  printf 'ok: cursor-agent task scenario smoke returned CURSOR_TASK_SCENARIO_OK (environment-gated runtime proof)\n'

  task_plan_output="$(
    timeout "$TIMEOUT_SECONDS" cursor-agent \
      -p \
      --output-format text \
      --model auto \
      --mode ask \
      --trust \
      --workspace "$ROOT" \
      "Without editing files or running write commands, a richer packaging claim is proposed. Which validator should be rerun first, and what ownership class must checked-in plugin packaging currently keep? Reply with exactly: CURSOR_TASK_PLAN_OK scripts/validate-benchmark-evidence.sh unsupported-or-out-of-scope" 2>&1
  )" || {
    printf '%s\n' "$task_plan_output" >&2
    echo "FAIL: cursor-agent task plan smoke failed" >&2
    exit 1
  }
  printf '%s\n' "$task_plan_output" | grep -Fxq 'CURSOR_TASK_PLAN_OK scripts/validate-benchmark-evidence.sh unsupported-or-out-of-scope' || {
    printf '%s\n' "$task_plan_output" >&2
    echo "FAIL: cursor-agent task plan smoke missing CURSOR_TASK_PLAN_OK" >&2
    exit 1
  }
  printf 'ok: cursor-agent task plan smoke returned CURSOR_TASK_PLAN_OK (environment-gated runtime proof)\n'
else
  printf 'ok: model-backed Cursor smoke skipped; runtime claim remains bounded until enhanced prompt proof is requested\n'
fi

printf 'ok: Cursor CLI smoke validation complete\n'
