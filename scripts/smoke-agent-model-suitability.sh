#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_MODEL_SMOKE="${RUN_AGENT_MODEL_SUITABILITY_SMOKE:-0}"
TIMEOUT_SECONDS="${CURSOR_SMOKE_TIMEOUT:-120}"
ROLE_SELECTION="${AGENT_MODEL_SUITABILITY_ROLES:-orchestrator,verifier,code-reviewer}"
ALL_ROLES=0

usage() {
  cat <<'USAGE'
Usage: scripts/smoke-agent-model-suitability.sh [--run-model-smoke] [--roles a,b,c] [--all-roles]

Validates the OMCS agent model policy and, when explicitly requested, runs a
small environment-gated Cursor Agent smoke for selected governed roles using
the resolved parent CLI model. This smoke does not change agent frontmatter; it
records whether the current account/model can follow role-specific instructions.

Set RUN_AGENT_MODEL_SUITABILITY_SMOKE=1 or pass --run-model-smoke to run the
model-backed role prompts. By default it checks a representative sample:
orchestrator, verifier, code-reviewer. Use --all-roles only for a long benchmark
run, or pass --roles role-a,role-b.
USAGE
}

while (($#)); do
  case "$1" in
    --run-model-smoke)
      RUN_MODEL_SMOKE=1
      shift
      ;;
    --roles)
      [[ $# -ge 2 ]] || { echo "FAIL: --roles requires a comma-separated list" >&2; exit 1; }
      ROLE_SELECTION="$2"
      shift 2
      ;;
    --all-roles)
      ALL_ROLES=1
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

command -v python3 >/dev/null 2>&1 || { echo "FAIL: python3 not found" >&2; exit 1; }
python3 "$ROOT/scripts/validate-agent-model-policy.py"

if [[ "$RUN_MODEL_SMOKE" != "1" ]]; then
  echo "ok: role model suitability prompt smoke skipped; set RUN_AGENT_MODEL_SUITABILITY_SMOKE=1 to run model-backed checks"
  exit 0
fi

command -v cursor-agent >/dev/null 2>&1 || { echo "FAIL: cursor-agent not found" >&2; exit 1; }
MODEL="${CURSOR_SMOKE_MODEL:-}"
if [[ -z "$MODEL" ]]; then
  MODEL="$(python3 "$ROOT/scripts/resolve-cursor-model.py")"
fi

fallback_model() {
  cursor-agent --list-models 2>/dev/null | python3 -c 'import sys; models=[]
for raw in sys.stdin:
    line=raw.strip()
    lower=line.lower()
    if not line or lower.startswith("available models") or lower.startswith("no models available"):
        continue
    slug=line.split(" - ",1)[0].strip() if " - " in line else line.split()[0]
    if slug and slug not in models:
        models.append(slug)
prefs=("composer-2.5-fast","composer-2.5","auto")
print(next((p for p in prefs if p in models), models[0] if models else ""))'
}
echo "ok: using Cursor role suitability smoke model $MODEL"

all_roles=(
  architect
  orchestrator
  researcher
  explore
  planner
  qa-tester
  implementer
  debugger
  test-engineer
  verifier
  critic
  code-reviewer
  security-reviewer
  tracer
)

if [[ "$ALL_ROLES" == "1" ]]; then
  roles=("${all_roles[@]}")
else
  IFS=',' read -r -a roles <<< "$ROLE_SELECTION"
fi

for role in "${roles[@]}"; do
  role="${role//[[:space:]]/}"
  [[ -n "$role" ]] || continue
  known=0
  for known_role in "${all_roles[@]}"; do
    if [[ "$role" == "$known_role" ]]; then
      known=1
      break
    fi
  done
  [[ "$known" == "1" ]] || { echo "FAIL: unknown role for model suitability smoke: $role" >&2; exit 1; }
done

for role in "${roles[@]}"; do
  role="${role//[[:space:]]/}"
  [[ -n "$role" ]] || continue
  expected="ROLE_MODEL_SMOKE_OK ${role}"
  prompt="Do not edit files or run shell commands. Read agents/${role}.md conceptually as the role contract. Reply with exactly: ${expected}"
  output=""
  for attempt in 1 2 3 4 5; do
    if output="$(
      timeout "$TIMEOUT_SECONDS" cursor-agent \
        -p \
        --output-format text \
        --model "$MODEL" \
        --mode ask \
        --trust \
        --workspace "$ROOT" \
        "$prompt" 2>&1
    )"; then
      break
    fi
    if printf '%s\n' "$output" | grep -Fq 'Cannot use this model:'; then
      next_model="auto"
      if [[ "$MODEL" == "auto" ]]; then
        next_model="$(fallback_model)"
      fi
      if [[ -n "$next_model" && "$next_model" != "$MODEL" ]]; then
        printf 'bounded: Cursor rejected role smoke model %s for %s; retrying with %s\n' "$MODEL" "$role" "$next_model" >&2
        MODEL="$next_model"
        continue
      fi
      if [[ -z "$next_model" && "$attempt" -lt 5 ]]; then
        printf 'bounded: Cursor rejected role smoke model %s for %s and model list was unavailable; retrying same model\n' "$MODEL" "$role" >&2
        sleep "$attempt"
        continue
      fi
    fi
    if [[ "$attempt" -lt 5 ]] && printf '%s\n' "$output" | grep -Eiq 'Connection lost|Retry attempt|tls handshake eof|stream disconnected|reconnecting|temporarily unavailable|Client network socket disconnected|secure TLS connection|\[aborted\]'; then
      printf 'bounded: transient cursor-agent failure during role smoke for %s (attempt %s/5), retrying\n' "$role" "$attempt" >&2
      sleep "$attempt"
      continue
    fi
    printf '%s\n' "$output" >&2
    echo "FAIL: role model suitability smoke failed for ${role}" >&2
    exit 1
  done
  if ! printf '%s\n' "$output" | grep -Fxq "$expected"; then
    printf '%s\n' "$output" >&2
    echo "FAIL: role model suitability smoke missing expected marker for ${role}" >&2
    exit 1
  fi
  echo "ok: role model suitability smoke passed for ${role}"
done

echo "AGENT_MODEL_SUITABILITY_SMOKE_OK"
