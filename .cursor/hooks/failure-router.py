#!/usr/bin/env python3
"""postToolUseFailure hook: route tool failures to the debugger role.

Fires when a tool fails, times out, or is denied. The hook is observational:
it never blocks, never edits state, and emits a short `additional_context`
note that reminds the agent to route the failure through the debugger agent
prompt and to record `failure.type` via the workflow-state writer helper.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402
from _tool_payload import extract_tool_name  # noqa: E402


FAILURE_TYPES = {
    "transient",
    "fixable",
    "needs_replan",
    "escalate",
    "flaky",
    "regression",
}


def _read_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {"_invalid_json": True}
    return value if isinstance(value, dict) else {"payload": value}


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({"status": "pass", "fail_open": True, "additional_context": "", "message": "Failure-router input was not JSON; skipped."}))
        return 0

    tool_name = extract_tool_name(payload)

    error_message = ""
    for key in ("error_message", "errorMessage", "message", "error"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            error_message = value
            break

    failure_type = ""
    for key in ("failure_type", "failureType", "type"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            failure_type = value
            break

    parts = [
        "Tool failure observed."
        + (f" Tool: {tool_name}." if tool_name else "")
        + (f" Failure type: {failure_type}." if failure_type else ""),
        "Route this failure through .cursor/agents/debugger.md before retrying.",
        "Record the failure with .cursor/state/workflow-state.py (or scripts/workflow-state.py) using one of: "
        + ", ".join(sorted(FAILURE_TYPES))
        + ".",
    ]
    if error_message:
        excerpt = error_message.strip().splitlines()[0][:200]
        parts.append("First error line: " + excerpt)

    output = {
        "status": "pass",
        "fail_open": True,
        "additional_context": " ".join(parts),
        "tool_name": tool_name,
        "failure_type": failure_type,
        "recommended_role": "debugger",
    }
    _trace({
        "hook": "failure-router",
        "event": "postToolUseFailure",
        "tool_name": tool_name,
        "failure_type": failure_type,
        "error_excerpt": error_message[:120],
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
