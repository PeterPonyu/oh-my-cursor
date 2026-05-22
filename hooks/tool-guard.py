#!/usr/bin/env python3
"""preToolUse hook: protect the workflow-state file from direct mutations.

Fires before any tool executes. The hook keeps `permission=allow` for almost
every call. It only sets `permission=ask` when a non-shell editing tool
(Write, Edit, MultiEdit, NotebookEdit) targets a file whose basename is
`workflow-state.json`, so the user can confirm before bypassing the
workflow-state CLI or MCP writer helpers with raw JSON edits.

The hook never denies a request and never modifies tool input. Shell commands
are out of scope here; `hooks/shell-guard.py` covers `beforeShellExecution`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path, PurePosixPath

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402
from _active_role import (  # noqa: E402
    agent_is_readonly,
    agent_tools_allowlist,
    get_active_role,
)
from _tool_payload import extract_file_path, extract_tool_name  # noqa: E402


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


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({"status": "pass", "fail_open": True, "permission": "allow", "user_message": "Tool-guard input was not JSON; skipped."}))
        return 0

    tool_name = extract_tool_name(payload)
    file_path = extract_file_path(payload)
    basename = PurePosixPath(file_path.replace("\\", "/")).name if file_path else ""

    active_role = get_active_role()
    role_readonly = agent_is_readonly(active_role) if active_role else None
    role_tools = agent_tools_allowlist(active_role) if active_role else None

    if tool_name in EDIT_TOOLS and basename == "workflow-state.json":
        permission = "ask"
        message = (
            "Tool-guard observed a direct edit to a workflow-state.json document. "
            "Prefer the cursor-state-bridge tools or scripts/workflow-state.py "
            "(the installed `.cursor/state/workflow-state.py` path is a compatibility shim) so phase, "
            "acceptance criteria, and history advance through one bounded path."
        )
        status = "ask"
    elif active_role and role_readonly is True and tool_name in EDIT_TOOLS:
        permission = "ask"
        message = (
            f"Tool-guard: active subagent role `{active_role}` declares `readonly: true` "
            f"in agents/{active_role}.md. Edit-class tools require user confirmation. "
            "If this edit is intended, approve to proceed; otherwise route the change to a non-readonly role."
        )
        status = "ask"
    elif active_role and isinstance(role_tools, list) and tool_name and tool_name not in role_tools:
        permission = "ask"
        message = (
            f"Tool-guard: active subagent role `{active_role}` does not list `{tool_name}` in its "
            f"`tools:` allowlist (agents/{active_role}.md). Approve to proceed or extend the allowlist."
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
        "active_role": active_role or "",
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
