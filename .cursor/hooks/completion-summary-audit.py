#!/usr/bin/env python3
from __future__ import annotations

import json
import sys


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


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({"status": "pass", "continue": False, "message": "Stop hook input was not JSON; skipped audit."}))
        return 0

    status = _first_string(payload, ("status", "final_status", "outcome", "result")).lower()
    loop_count = _loop_count(payload)
    should_continue = status in ERROR_STATUSES and loop_count < 1

    message = (
        "Before final delivery, verify every acceptance criterion with fresh evidence and keep runtime claims bounded to checked-in artifacts plus actual smoke results."
    )
    if should_continue:
        message = (
            "The stop event reports an error. One conservative follow-up is allowed to collect failure evidence, fix only the blocking issue, and rerun the relevant check."
        )

    output = {
        "status": "followup-requested" if should_continue else "pass",
        "continue": should_continue,
        "loop_limit": 1,
        "loop_count": loop_count,
        "user_facing_message": message,
        "additional_context": message if should_continue else "",
    }
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())