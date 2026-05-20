#!/usr/bin/env python3
"""subagentStop hook: observational summary of subagent runs.

Fires when a subagent (Task tool) completes, errors, or aborts. The hook
emits a structured JSON summary describing the recorded subagent_type,
status, and modified file count. It never returns a `followup_message` so it
does not consume the auto-follow-up loop budget.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402
from _active_role import clear_active_role  # noqa: E402


def _read_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {"_invalid_json": True}
    return value if isinstance(value, dict) else {"payload": value}


def _str_field(payload: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def _int_field(payload: dict, keys: tuple[str, ...]) -> int | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return None


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({"status": "pass", "fail_open": True, "message": "Subagent-summary input was not JSON; skipped."}))
        return 0

    subagent_type = _str_field(payload, ("subagent_type", "subagentType", "type")).lower()
    status = _str_field(payload, ("status", "final_status", "outcome", "result")).lower()
    summary = _str_field(payload, ("summary", "message"))

    modified_files: list[str] = []
    raw_modified = payload.get("modified_files") or payload.get("modifiedFiles")
    if isinstance(raw_modified, list):
        for item in raw_modified:
            if isinstance(item, str):
                modified_files.append(item)

    try:
        clear_active_role()
    except OSError:
        pass

    output = {
        "status": "pass",
        "fail_open": True,
        "subagent": {
            "subagent_type": subagent_type,
            "status": status,
            "summary_excerpt": summary[:200] if summary else "",
            "duration_ms": _int_field(payload, ("duration_ms", "durationMs")),
            "message_count": _int_field(payload, ("message_count", "messageCount")),
            "tool_call_count": _int_field(payload, ("tool_call_count", "toolCallCount")),
            "loop_count": _int_field(payload, ("loop_count", "loopCount")),
            "modified_file_count": len(modified_files),
        },
        "message": "Subagent-summary observed completion; no automatic follow-up requested.",
    }
    _trace({
        "hook": "subagent-summary",
        "event": "subagentStop",
        "subagent_type": subagent_type,
        "status_field": status,
        "modified_file_count": len(modified_files),
        "summary_excerpt": summary[:120] if summary else "",
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
