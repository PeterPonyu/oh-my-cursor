#!/usr/bin/env python3
"""sessionStart hook: surface workflow-state and discipline reminders.

Fires once when a Cursor composer/agent session opens. Reads any reachable
workflow-state document (via `OH_MY_CURSOR_WORKFLOW_STATE` env var or a
`workflow_state` field on the event) and emits a short `additional_context`
string that names the active phase, role, and pending acceptance criteria so
the agent picks up the orchestration contract without the user repeating it.

The hook is fail-open. It never sets environment variables and never blocks
session creation.
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
if not (ROOT / ".cursor" / "hooks").exists() or "plugins/local/oh-my-cursor" in str(ROOT):
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
        "current_role": data.get("current_role"),
        "next_action": data.get("next_action"),
        "pending_criteria": pending[:10],
        "failed_criteria": failed[:10],
    }


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({"status": "pass", "fail_open": True, "additional_context": "", "message": "Session-bootstrap input was not JSON; skipped."}))
        return 0

    state_path = _resolve_state_path(payload)
    state_summary = _summarize_state(state_path) if state_path else {"loaded": False}

    parts: list[str] = [
        "Repo backbone: oh-my-cursor uses claim/proof discipline (repo-owned / host-product-only / unsupported-or-out-of-scope) and a file-backed workflow-state contract under .cursor/state/.",
    ]
    if state_summary.get("loaded"):
        parts.append(
            "Active workflow state: phase="
            + str(state_summary.get("phase") or "?")
            + ", status="
            + str(state_summary.get("status") or "?")
            + (", role=" + str(state_summary.get("current_role")) if state_summary.get("current_role") else "")
            + "."
        )
        if state_summary.get("failed_criteria"):
            parts.append("Failed acceptance criteria: " + ", ".join(state_summary["failed_criteria"]) + ".")
        if state_summary.get("pending_criteria"):
            parts.append("Pending acceptance criteria: " + ", ".join(state_summary["pending_criteria"]) + ".")
        if state_summary.get("next_action"):
            parts.append("Recorded next action: " + str(state_summary["next_action"]) + ".")
    else:
        parts.append("No active workflow state was found; the phase-controller skill can initialize one.")

    output = {
        "status": "pass",
        "fail_open": True,
        "additional_context": " ".join(parts),
        "env": {},
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
        "hook": "session-bootstrap",
        "event": "sessionStart",
        "state_loaded": state_summary.get("loaded", False),
        "phase": state_summary.get("phase"),
        "current_role": state_summary.get("current_role"),
        "session_id": payload.get("session_id") if isinstance(payload, dict) else None,
        "composer_mode": payload.get("composer_mode") if isinstance(payload, dict) else None,
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
