#!/usr/bin/env python3
"""preCompact hook: preserve workflow-state context across compaction.

Fires before Cursor compacts/summarizes the conversation context. When a
workflow-state document is reachable, the hook emits a short `user_message`
listing the active phase, role, and pending acceptance criteria so the
post-compact summary keeps the orchestration anchors. The hook is fail-open
and never blocks compaction.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def _read_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {"_invalid_json": True}
    return value if isinstance(value, dict) else {"payload": value}


def _resolve_state_path(payload: dict) -> Path | None:
    candidates: list[str] = []
    env_path = os.environ.get("OH_MY_CURSOR_WORKFLOW_STATE")
    if env_path:
        candidates.append(env_path)
    payload_path = payload.get("workflow_state") if isinstance(payload, dict) else None
    if isinstance(payload_path, str):
        candidates.append(payload_path)
    # Canonical fallback: the path the bridge writes to when no task_id is
    # supplied. After Stage 7 (phase-controller pinned to .cursor/state),
    # this is the everyday location and the env-var/payload overrides are
    # only for unusual setups.
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
    if not isinstance(data, dict):
        return {"loaded": False}
    pending: list[str] = []
    failed: list[str] = []
    criteria = data.get("acceptance_criteria")
    if isinstance(criteria, list):
        for item in criteria:
            if not isinstance(item, dict):
                continue
            status = str(item.get("status", "")).lower()
            label = str(item.get("id") or item.get("criterion") or "").strip()
            if not label:
                continue
            if status == "failed":
                failed.append(label)
            elif status not in {"passed", "skipped"}:
                pending.append(label)
    return {
        "loaded": True,
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
        print(json.dumps({"status": "pass", "fail_open": True, "user_message": "", "message": "Compact-reminder input was not JSON; skipped."}))
        return 0

    trigger = ""
    for key in ("trigger", "compaction_trigger"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            trigger = value
            break

    state_path = _resolve_state_path(payload)
    state_summary = _summarize_state(state_path) if state_path else {"loaded": False}

    parts: list[str] = []
    if state_summary.get("loaded"):
        parts.append(
            "Compact-reminder: keep the orchestration anchors in the post-compact summary."
        )
        parts.append(
            "phase=" + str(state_summary.get("phase") or "?")
            + ", status=" + str(state_summary.get("status") or "?")
            + (", role=" + str(state_summary.get("current_role")) if state_summary.get("current_role") else "")
            + "."
        )
        if state_summary.get("failed_criteria"):
            parts.append("Failed AC: " + ", ".join(state_summary["failed_criteria"]) + ".")
        if state_summary.get("pending_criteria"):
            parts.append("Pending AC: " + ", ".join(state_summary["pending_criteria"]) + ".")
        if state_summary.get("next_action"):
            parts.append("Recorded next action: " + str(state_summary["next_action"]) + ".")
    else:
        parts.append(
            "Compact-reminder: no active workflow-state document was reachable at "
            ".cursor/state/workflow-state.json or via override. If a task is in "
            "flight, run `state_init` through the cursor-state-bridge MCP server "
            "(or `python3 .cursor/state/workflow-state.py init ...`) before the "
            "next compaction so the post-compact summary keeps the orchestration "
            "anchors."
        )

    output = {
        "status": "pass",
        "fail_open": True,
        "user_message": " ".join(parts),
        "trigger": trigger,
        "workflow_state": {
            "path": state_path.as_posix() if state_path else None,
            "loaded": state_summary.get("loaded", False),
            "phase": state_summary.get("phase"),
            "status": state_summary.get("status"),
            "current_role": state_summary.get("current_role"),
            "pending_criteria": state_summary.get("pending_criteria", []),
            "failed_criteria": state_summary.get("failed_criteria", []),
        },
    }
    _trace({
        "hook": "compact-reminder",
        "event": "preCompact",
        "trigger": trigger,
        "state_loaded": state_summary.get("loaded", False),
        "phase": state_summary.get("phase"),
        "pending_criteria": state_summary.get("pending_criteria", [])[:5],
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
