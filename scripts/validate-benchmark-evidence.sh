#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: scripts/validate-benchmark-evidence.sh [--root PATH]

Validates the checked-in Cursor benchmark evidence contract:
  - current baseline/enhanced benchmark artifacts exist
  - current evaluation snapshots pass their release thresholds
  - README-visible refinement and boundary-review docs are actually scored
  - enhanced runs prove model-backed uplift while baseline stays bounded
USAGE
}

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

while (($#)); do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || fail "--root requires a path"
      ROOT="$(cd "$2" && pwd)"
      shift 2
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

require_file() {
  [[ -f "$ROOT/$1" ]] || fail "missing required file: $1"
}

BASELINE_RESULTS="benchmark/results/current-baseline/backbone_results.json"
BASELINE_EVAL="benchmark/results/current-baseline/backbone_evaluation.json"
ENHANCED_RESULTS="benchmark/results/current-enhanced/backbone_results.json"
ENHANCED_EVAL="benchmark/results/current-enhanced/backbone_evaluation.json"

for path in \
  "$BASELINE_RESULTS" "$BASELINE_EVAL" \
  "$ENHANCED_RESULTS" "$ENHANCED_EVAL"
do
  require_file "$path"
done

grep -Eq 'different, smaller contract' "$ROOT/benchmark/README.md" || fail "benchmark README must keep the smaller-contract wording"
grep -Eq 'refinement-priority-map\.md' "$ROOT/benchmark/README.md" || fail "benchmark README must mention the refinement-priority map"
grep -Eq 'plugin-boundary-review\.md' "$ROOT/benchmark/README.md" || fail "benchmark README must mention the plugin-boundary review"
log "benchmark README describes the current smaller contract and its new proof docs"

python3 - "$ROOT" "$BASELINE_RESULTS" "$BASELINE_EVAL" "$ENHANCED_RESULTS" "$ENHANCED_EVAL" <<'PY'
from __future__ import annotations
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
baseline_results_rel = sys.argv[2]
baseline_eval_rel = sys.argv[3]
enhanced_results_rel = sys.argv[4]
enhanced_eval_rel = sys.argv[5]
history_md = (root / "benchmark" / "results" / "history.md").read_text(encoding="utf-8")


def fail(msg: str) -> None:
    raise SystemExit(f"FAIL: {msg}")


def ok(msg: str) -> None:
    print(f"ok: {msg}")


def load_json(rel: str):
    path = root / rel
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"could not read {rel}: {exc}")


baseline_results = load_json(baseline_results_rel)
enhanced_results = load_json(enhanced_results_rel)
baseline_eval = load_json(baseline_eval_rel)
enhanced_eval = load_json(enhanced_eval_rel)

for label, data in (("baseline", baseline_results), ("enhanced", enhanced_results)):
    if not isinstance(data, list) or len(data) != 5:
        fail(f"{label} results must contain 5 checks")
    failed = [entry.get("name", "<unknown>") for entry in data if not entry.get("success")]
    if failed:
        fail(f"{label} results contain failing checks: {', '.join(failed)}")
    ok(f"{label} benchmark results all passed")

for label, evaluation in (("baseline", baseline_eval), ("enhanced", enhanced_eval)):
    if not evaluation.get("passed"):
        fail(f"{label} evaluation is not passing")
    ok(f"{label} contract evaluation passed at {evaluation['score']}/{evaluation['max_score']}")

surface_visibility_markers = set(
    next(
        (entry.get("markers", []) for entry in baseline_results if entry["name"] == "surface_visibility"),
        [],
    )
)
for token in ("REFINEMENT_MAP_OK", "PLUGIN_BOUNDARY_OK"):
    if token not in surface_visibility_markers:
        fail(f"baseline surface_visibility is missing {token}")
ok("baseline proof now measures the README-visible refinement and boundary-review docs")

smoke_tail = next(
    (entry["output_tail"] for entry in enhanced_results if entry["name"] == "smoke_cursor"),
    "",
)
if "CURSOR_AGENT_OK" not in smoke_tail:
    fail("enhanced smoke is missing CURSOR_AGENT_OK")
if "CURSOR_TASK_SCENARIO_OK" not in smoke_tail:
    fail("enhanced smoke is missing CURSOR_TASK_SCENARIO_OK")
if "CURSOR_TASK_PLAN_OK" not in smoke_tail:
    fail("enhanced smoke is missing CURSOR_TASK_PLAN_OK")
if "CURSOR_TASK_COMMAND_OK" not in smoke_tail:
    fail("enhanced smoke is missing CURSOR_TASK_COMMAND_OK")
ok("enhanced proof includes model-backed Cursor smoke evidence and constrained repo-task answers")

if baseline_eval.get("investigation_required"):
    fail("baseline should not require investigation")
if enhanced_eval.get("investigation_required"):
    fail("enhanced should not require investigation")
ok("current baseline/enhanced runs do not raise investigation-required flags")

for snippet in (
    f"{baseline_eval['score']}/{baseline_eval['max_score']}",
    f"{enhanced_eval['score']}/{enhanced_eval['max_score']}",
):
    if snippet not in history_md:
        fail(f"benchmark history is missing current score snippet {snippet}")
ok("history.md records the current baseline/enhanced benchmark scores")
PY

log "Cursor benchmark evidence validation complete"
