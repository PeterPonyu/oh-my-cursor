#!/usr/bin/env python3
"""preToolUse hook: protect the workflow-state file from direct mutations.

Fires before any tool executes. The hook keeps `permission=allow` for almost
every call. It only sets `permission=ask` when a non-shell editing tool
(Write, Edit, MultiEdit, NotebookEdit) targets a file whose basename is
`workflow-state.json`, so the user can confirm before bypassing the writer
helper at `.cursor/state/workflow-state.py`.

The hook never denies a request and never modifies tool input. Shell commands
are out of scope here; `.cursor/hooks/shell-guard.py` covers `beforeShellExecution`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path, PurePosixPath

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402


EDIT_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}


def _read_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {"_invalid_json": True}
    return value if isinstance(value, dict) else {"payload": value}


def _extract_tool_name(payload: dict) -> str:
    for key in ("tool_name", "toolName", "name"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def _extract_file_path(payload: dict) -> str:
    tool_input = payload.get("tool_input") if isinstance(payload, dict) else None
    if isinstance(tool_input, dict):
        for key in ("file_path", "filePath", "path", "notebook_path", "notebookPath"):
            value = tool_input.get(key)
            if isinstance(value, str) and value.strip():
                return value
    for key in ("file_path", "filePath", "path"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({"status": "pass", "fail_open": True, "permission": "allow", "user_message": "Tool-guard input was not JSON; skipped."}))
        return 0

    tool_name = _extract_tool_name(payload)
    file_path = _extract_file_path(payload)
    basename = PurePosixPath(file_path.replace("\\", "/")).name if file_path else ""

    if tool_name in EDIT_TOOLS and basename == "workflow-state.json":
        permission = "ask"
        message = (
            "Tool-guard observed a direct edit to a workflow-state.json document. "
            "Prefer the writer helper at .cursor/state/workflow-state.py "
            "(or scripts/workflow-state.py from the repo root) so phase, "
            "acceptance criteria, and history advance through one bounded path."
        )
        status = "ask"
    else:
        permission = "allow"
        message = "Tool-guard saw no protected file mutation."
        status = "pass"

    output = {
        "status": status,
        "fail_open": permission != "deny",
        "permission": permission,
        "user_message": message,
        "tool_name": tool_name,
        "file_path": file_path,
    }
    _trace({
        "hook": "tool-guard",
        "event": "preToolUse",
        "status": status,
        "permission": permission,
        "tool_name": tool_name,
        "file_basename": basename,
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
