#!/usr/bin/env python3
"""sessionEnd hook: observational session summary.

Fires when a Cursor composer/agent session ends. The hook is purely
observational: it emits a structured JSON summary describing the final status
recorded by Cursor and any pending or failed acceptance criteria from a
reachable workflow-state file. It never blocks closure and never writes state.
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
        "pending_criteria": pending[:10],
        "failed_criteria": failed[:10],
    }


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({"status": "pass", "fail_open": True, "message": "Session-summary input was not JSON; skipped."}))
        return 0

    final_status = ""
    for key in ("final_status", "status", "result", "outcome"):
        value = payload.get(key)
        if isinstance(value, str):
            final_status = value
            break

    duration_ms = payload.get("duration_ms") if isinstance(payload, dict) else None

    state_path = _resolve_state_path(payload)
    state_summary = _summarize_state(state_path) if state_path else {"loaded": False}

    output = {
        "status": "pass",
        "fail_open": True,
        "session": {
            "session_id": payload.get("session_id") if isinstance(payload, dict) else None,
            "reason": payload.get("reason") if isinstance(payload, dict) else None,
            "final_status": final_status,
            "duration_ms": duration_ms,
            "error_message": payload.get("error_message") if isinstance(payload, dict) else None,
        },
        "workflow_state": {
            "path": state_path.as_posix() if state_path else None,
            "loaded": state_summary.get("loaded", False),
            "phase": state_summary.get("phase"),
            "status": state_summary.get("status"),
            "pending_criteria": state_summary.get("pending_criteria", []),
            "failed_criteria": state_summary.get("failed_criteria", []),
        },
        "message": "Session-summary observed closure; no enforcement.",
    }
    _trace({
        "hook": "session-summary",
        "event": "sessionEnd",
        "session_id": payload.get("session_id") if isinstance(payload, dict) else None,
        "final_status": final_status,
        "duration_ms": duration_ms,
        "state_loaded": state_summary.get("loaded", False),
        "pending_criteria": state_summary.get("pending_criteria", [])[:5],
        "failed_criteria": state_summary.get("failed_criteria", [])[:5],
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
