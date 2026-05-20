#!/usr/bin/env python3
"""Validate a workflow-state JSON document against the repo schema.

Usage:
  python3 scripts/validate-workflow-state.py [path]

Defaults to .cursor/state/workflow-state.example.json. The validator uses only
the Python standard library so it runs anywhere `python3` is available.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / ".cursor" / "state" / "workflow-state.schema.json"

ALLOWED_PHASES = {"intake", "research", "plan", "execute", "verify", "review", "done", "blocked"}
ALLOWED_STATUSES = {"pending", "in_progress", "passed", "failed", "blocked"}
ALLOWED_ROLES = {
    "",
    "architect",
    "code-reviewer",
    "critic",
    "debugger",
    "explore",
    "implementer",
    "orchestrator",
    "planner",
    "qa-tester",
    "researcher",
    "security-reviewer",
    "test-engineer",
    "tracer",
    "verifier",
}
ALLOWED_AC_STATUSES = {"pending", "passed", "failed", "skipped"}
ALLOWED_FAILURE_TYPES = {
    "",
    "transient",
    "fixable",
    "needs_replan",
    "escalate",
    "flaky",
    "regression",
}
ALLOWED_TOP_KEYS = {
    "task_id",
    "title",
    "phase",
    "status",
    "current_role",
    "next_action",
    "acceptance_criteria",
    "failure",
    "history",
    "tasks",
}
ALLOWED_AC_KEYS = {"id", "criterion", "status", "evidence"}
ALLOWED_FAILURE_KEYS = {"type", "message", "retry_count"}
ALLOWED_HISTORY_KEYS = {"phase", "status", "note", "at", "role"}


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def ok(message: str) -> None:
    print(f"ok: {message}")


def _expect_keys(obj: dict, allowed: set[str], label: str) -> None:
    extra = set(obj.keys()) - allowed
    if extra:
        fail(f"{label} contains unsupported fields: {sorted(extra)}")


def validate(path: Path) -> None:
    if not path.is_file():
        fail(f"state file not found: {path}")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"state file is not valid JSON: {exc}")
    if not isinstance(data, dict):
        fail("state file root must be a JSON object")

    _expect_keys(data, ALLOWED_TOP_KEYS, "top-level state")

    for required in ("task_id", "phase", "status", "acceptance_criteria"):
        if required not in data:
            fail(f"missing required field: {required}")

    if not isinstance(data["task_id"], str) or not data["task_id"].strip():
        fail("task_id must be a non-empty string")
    if data["phase"] not in ALLOWED_PHASES:
        fail(f"phase must be one of {sorted(ALLOWED_PHASES)}")
    if data["status"] not in ALLOWED_STATUSES:
        fail(f"status must be one of {sorted(ALLOWED_STATUSES)}")

    role = data.get("current_role", "")
    if role not in ALLOWED_ROLES:
        fail(f"current_role must be one of {sorted(ALLOWED_ROLES)}")

    criteria = data["acceptance_criteria"]
    if not isinstance(criteria, list):
        fail("acceptance_criteria must be an array")
    seen_ids: set[str] = set()
    for index, item in enumerate(criteria):
        if not isinstance(item, dict):
            fail(f"acceptance_criteria[{index}] must be an object")
        _expect_keys(item, ALLOWED_AC_KEYS, f"acceptance_criteria[{index}]")
        for required in ("id", "criterion", "status"):
            if required not in item:
                fail(f"acceptance_criteria[{index}] missing required field: {required}")
        ac_id = item["id"]
        if not isinstance(ac_id, str) or not ac_id.strip():
            fail(f"acceptance_criteria[{index}].id must be a non-empty string")
        if ac_id in seen_ids:
            fail(f"duplicate acceptance_criteria id: {ac_id}")
        seen_ids.add(ac_id)
        if item["status"] not in ALLOWED_AC_STATUSES:
            fail(f"acceptance_criteria[{index}].status must be one of {sorted(ALLOWED_AC_STATUSES)}")

    failure = data.get("failure")
    if failure is not None:
        if not isinstance(failure, dict):
            fail("failure must be an object")
        _expect_keys(failure, ALLOWED_FAILURE_KEYS, "failure")
        if "type" in failure and failure["type"] not in ALLOWED_FAILURE_TYPES:
            fail(f"failure.type must be one of {sorted(ALLOWED_FAILURE_TYPES)}")
        if "retry_count" in failure:
            retry = failure["retry_count"]
            if not isinstance(retry, int) or retry < 0 or retry > 3:
                fail("failure.retry_count must be an integer between 0 and 3")

    history = data.get("history")
    if history is not None:
        if not isinstance(history, list):
            fail("history must be an array")
        for index, item in enumerate(history):
            if not isinstance(item, dict):
                fail(f"history[{index}] must be an object")
            _expect_keys(item, ALLOWED_HISTORY_KEYS, f"history[{index}]")
            for required in ("phase", "status"):
                if required not in item:
                    fail(f"history[{index}] missing required field: {required}")

    ok(f"workflow-state document is valid: {path}")


def _check_history_monotonic(path: Path) -> None:
    """AC-208 helper: verify history[].at is non-decreasing ISO date strings.

    Empty or missing history is treated as monotonic by definition.
    """
    if not path.is_file():
        fail(f"state file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"state file is not valid JSON: {exc}")
    if not isinstance(data, dict):
        fail("state file root must be a JSON object")
    history = data.get("history") or []
    if not isinstance(history, list):
        fail("history must be an array")
    ats: list[str] = []
    for index, item in enumerate(history):
        if not isinstance(item, dict):
            fail(f"history[{index}] must be an object")
        at = item.get("at", "")
        if not isinstance(at, str):
            fail(f"history[{index}].at must be a string")
        ats.append(at)
    if ats != sorted(ats):
        fail(
            "history[].at is not monotonic non-decreasing; "
            "concurrent writers may have interleaved without holding file_lock"
        )
    ok(f"history[].at is monotonic non-decreasing ({len(ats)} entries): {path}")


def _check_history_cap(path: Path, cap: int) -> None:
    """AC-701..AC-705 helper: assert ``len(history) <= cap`` and timestamps monotonic.

    ``cap <= 0`` skips the size assertion (matches the library's
    opt-out sentinel) but still verifies monotonicity, so callers can
    cheaply re-run the existing monotonic check via ``--check-history-cap 0``.
    """
    if not path.is_file():
        fail(f"state file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"state file is not valid JSON: {exc}")
    if not isinstance(data, dict):
        fail("state file root must be a JSON object")
    history = data.get("history") or []
    if not isinstance(history, list):
        fail("history must be an array")
    if cap > 0 and len(history) > cap:
        fail(
            f"history[] has {len(history)} entries; expected <= {cap} "
            "(library compaction was bypassed or the cap was disabled at write time)"
        )
    ats: list[str] = []
    for index, item in enumerate(history):
        if not isinstance(item, dict):
            fail(f"history[{index}] must be an object")
        at = item.get("at", "")
        if not isinstance(at, str):
            fail(f"history[{index}].at must be a string")
        ats.append(at)
    if ats != sorted(ats):
        fail("history[].at is not monotonic non-decreasing after compaction")
    if cap > 0:
        ok(f"history[] has {len(history)} entries (<= {cap}) and is monotonic: {path}")
    else:
        ok(f"history[] is monotonic non-decreasing ({len(history)} entries; cap disabled): {path}")


def main() -> int:
    args = list(sys.argv[1:])
    monotonic_only = False
    cap_check: int | None = None
    if "--check-history-monotonic" in args:
        args.remove("--check-history-monotonic")
        monotonic_only = True
    if "--check-history-cap" in args:
        idx = args.index("--check-history-cap")
        if idx + 1 >= len(args):
            fail("--check-history-cap requires an integer argument")
        try:
            cap_check = int(args[idx + 1])
        except ValueError:
            fail("--check-history-cap argument must be an integer")
        # Remove both the flag and its value.
        del args[idx : idx + 2]

    target = Path(args[0]) if args else (ROOT / ".cursor" / "state" / "workflow-state.example.json")
    if not SCHEMA_PATH.is_file():
        fail(f"schema missing: {SCHEMA_PATH}")

    if cap_check is not None:
        _check_history_cap(target, cap_check)
        print("WORKFLOW_STATE_HISTORY_CAP_OK")
        return 0

    if monotonic_only:
        _check_history_monotonic(target)
        print("WORKFLOW_STATE_HISTORY_MONOTONIC_OK")
        return 0

    validate(target)
    print("WORKFLOW_STATE_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
