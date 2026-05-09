#!/usr/bin/env python3
"""stop hook: workflow stop gate.

Replaces the older `completion-summary-audit.py` with a brief, lifecycle-style
name. Behavior is a strict superset:

- always emit a final-verification reminder;
- if the stop event reports an error and we are still inside the configured
  loop limit, allow exactly one conservative follow-up; and
- if a workflow-state document is reachable (via `OH_MY_CURSOR_WORKFLOW_STATE`
  env var or a `workflow_state` field in the stop payload), surface a concise
  summary of pending acceptance criteria so the user can finish them before
  closing the session.

The hook is fail-open: any malformed input or unreadable state file falls back
to the generic reminder instead of blocking the user.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402

# Resolve ROOT from environment or workspace, not __file__ (which may be unreliable in hook contexts)
ROOT = Path(os.environ.get("OH_MY_CURSOR_WORKSPACE", os.getcwd())).resolve()
if not (ROOT / "hooks").exists() or "plugins/local/oh-my-cursor" in str(ROOT):
    ROOT = Path(__file__).resolve().parents[1]
ERROR_STATUSES = {"error", "failed", "failure"}


def _read_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {"_invalid_json": True}
    return value if isinstance(value, dict) else {"payload": value}


def _first_string(payload: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str):
            return value
    return ""


def _loop_count(payload: dict) -> int:
    for key in ("loop_count", "loopCount", "current_loop", "currentLoop"):
        value = payload.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return 0


def _resolve_state_path(payload: dict) -> Path | None:
    """Locate the workflow-state document for this stop event.

    Resolution order:
    1. ``OH_MY_CURSOR_WORKFLOW_STATE`` environment variable -- override-only,
       intended for unusual setups (per-task archives under
       ``docs/plans/<task-id>/``, alternative workspace layouts, tests).
    2. ``workflow_state`` field on the stop payload -- same override semantics
       provided per-event by the host.
    3. The canonical default ``.cursor/state/workflow-state.json`` (matches
       the path the cursor-state-bridge writes when no ``task_id`` is set,
       and the path ``state-watcher.py`` validates after every bridge write).
    """
    candidates: list[str] = []
    env_path = os.environ.get("OH_MY_CURSOR_WORKFLOW_STATE")
    if env_path:
        candidates.append(env_path)
    payload_path = payload.get("workflow_state") if isinstance(payload, dict) else None
    if isinstance(payload_path, str):
        candidates.append(payload_path)
    candidates.append(str(ROOT / ".cursor" / "state" / "workflow-state.json"))
    for raw in candidates:
        try:
            candidate = Path(raw).expanduser()
            if not candidate.is_absolute():
                candidate = (ROOT / candidate).resolve()
            if candidate.is_file():
                return candidate
        except (OSError, RuntimeError, ValueError):
            continue
    return None


def _summarize_state(state_path: Path) -> dict:
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"loaded": False}

    criteria = data.get("acceptance_criteria")
    pending: list[str] = []
    failed: list[str] = []
    if isinstance(criteria, list):
        for item in criteria:
            if not isinstance(item, dict):
                continue
            status = str(item.get("status", "")).lower()
            label = str(item.get("id") or item.get("criterion") or "").strip()
            if not label:
                continue
            if status in {"failed"}:
                failed.append(label)
            elif status not in {"passed", "skipped"}:
                pending.append(label)

    return {
        "loaded": True,
        "task_id": data.get("task_id"),
        "phase": data.get("phase"),
        "status": data.get("status"),
        "current_role": data.get("current_role"),
        "next_action": data.get("next_action"),
        "pending_criteria": pending[:10],
        "failed_criteria": failed[:10],
    }


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({"status": "pass", "continue": False, "message": "Stop hook input was not JSON; skipped audit."}))
        return 0

    status = _first_string(payload, ("status", "final_status", "outcome", "result")).lower()
    loop_count = _loop_count(payload)
    should_continue = status in ERROR_STATUSES and loop_count < 1

    base_message = (
        "Before final delivery, verify every acceptance criterion with fresh evidence and keep runtime claims bounded to checked-in artifacts plus actual smoke results."
    )
    if should_continue:
        base_message = (
            "The stop event reports an error. One conservative follow-up is allowed to collect failure evidence, fix only the blocking issue, and rerun the relevant check."
        )

    state_path = _resolve_state_path(payload)
    state_summary = _summarize_state(state_path) if state_path else {"loaded": False}

    parts = [base_message]
    if state_summary.get("loaded"):
        if state_summary.get("failed_criteria"):
            parts.append(
                "Workflow state reports failed acceptance criteria: "
                + ", ".join(state_summary["failed_criteria"])
                + "."
            )
        if state_summary.get("pending_criteria"):
            parts.append(
                "Workflow state still has pending acceptance criteria: "
                + ", ".join(state_summary["pending_criteria"])
                + "."
            )
        if state_summary.get("next_action"):
            parts.append(f"Next recorded action: {state_summary['next_action']}.")

    user_message = " ".join(parts)

    output = {
        "status": "followup-requested" if should_continue else "pass",
        "continue": should_continue,
        "loop_limit": 1,
        "loop_count": loop_count,
        "user_facing_message": user_message,
        "additional_context": user_message if should_continue else "",
        "workflow_state": {
            "path": state_path.as_posix() if state_path else None,
            "loaded": state_summary.get("loaded", False),
            "task_id": state_summary.get("task_id"),
            "phase": state_summary.get("phase"),
            "status": state_summary.get("status"),
            "current_role": state_summary.get("current_role"),
            "pending_criteria": state_summary.get("pending_criteria", []),
            "failed_criteria": state_summary.get("failed_criteria", []),
        },
    }
    _trace({
        "hook": "stop-gate",
        "event": "stop",
        "status": output.get("status"),
        "continue": should_continue,
        "loop_count": loop_count,
        "state_loaded": state_summary.get("loaded", False),
        "pending_criteria": state_summary.get("pending_criteria", [])[:5],
        "failed_criteria": state_summary.get("failed_criteria", [])[:5],
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
