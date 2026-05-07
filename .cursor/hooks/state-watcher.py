#!/usr/bin/env python3
"""postToolUse hook: validate workflow-state edits against the schema.

Fires after a tool finishes. When the touched file basename is
`workflow-state.json`, the hook re-reads the file from disk and checks it
against `.cursor/state/workflow-state.schema.json` using only the Python
standard library (no external `jsonschema` dependency). The hook is purely
observational: it emits `additional_context` describing the validation
result and never edits any file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path, PurePosixPath

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402
from _tool_payload import extract_file_path, extract_tool_name  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / ".cursor" / "state" / "workflow-state.schema.json"
DEFAULT_STATE_PATH = ROOT / ".cursor" / "state" / "workflow-state.json"

EDIT_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}

# Bridge tools that mutate workflow-state.json. `state_read` is excluded so
# the watcher only re-validates after a write actually happened.
BRIDGE_WRITE_TOOLS = {
    "state_init",
    "state_set_phase",
    "state_record_failure",
    "state_update_acceptance_criterion",
    "state_history_append",
}
# Cursor surfaces MCP tool calls either by the wrapper method `tools/call`
# (with the inner tool name in `tool_input.name`) or by the prefixed
# `mcp__<server>__<tool>` form. The watcher accepts both.
MCP_PREFIX = "mcp__cursor-state-bridge__"


def _read_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {"_invalid_json": True}
    return value if isinstance(value, dict) else {"payload": value}


def _resolve_bridge_call(tool_name: str, payload: dict) -> tuple[str, str]:
    """If the call is a bridge write, return (inner_tool_name, target_path).

    Otherwise return ("", ""). Resolves the workflow-state target the same
    way `mcp/cursor-state-bridge/state_io.py:_resolve_state_path` does:
    `.cursor/state/workflow-state.json` when no `task_id` is supplied,
    `docs/plans/<task_id>/workflow-state.json` otherwise.
    """
    inner = ""
    if tool_name.startswith(MCP_PREFIX):
        inner = tool_name[len(MCP_PREFIX):]
    elif tool_name == "tools/call":
        tool_input = payload.get("tool_input")
        if isinstance(tool_input, dict):
            candidate = tool_input.get("name")
            if isinstance(candidate, str):
                inner = candidate.removeprefix(MCP_PREFIX)
    elif tool_name in BRIDGE_WRITE_TOOLS:
        inner = tool_name

    if inner not in BRIDGE_WRITE_TOOLS:
        return "", ""

    arguments: dict = {}
    tool_input = payload.get("tool_input")
    if isinstance(tool_input, dict):
        nested = tool_input.get("arguments")
        if isinstance(nested, dict):
            arguments = nested
        else:
            arguments = tool_input
    task_id = arguments.get("task_id") if isinstance(arguments.get("task_id"), str) else ""
    if task_id:
        return inner, str(ROOT / "docs" / "plans" / task_id / "workflow-state.json")
    return inner, str(DEFAULT_STATE_PATH)


def _validate_against_schema(document: object, schema: dict) -> list[str]:
    errors: list[str] = []
    if not isinstance(document, dict):
        errors.append("state document root must be an object")
        return errors
    required = schema.get("required") if isinstance(schema, dict) else None
    if isinstance(required, list):
        for field in required:
            if field not in document:
                errors.append(f"missing required field: {field}")
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    if not isinstance(properties, dict):
        return errors
    for field, value in document.items():
        spec = properties.get(field)
        if not isinstance(spec, dict):
            continue
        enum = spec.get("enum")
        if isinstance(enum, list) and value not in enum:
            errors.append(f"field {field} must be one of {sorted([str(item) for item in enum])}")
    criteria = document.get("acceptance_criteria")
    if isinstance(criteria, list):
        ac_statuses = {"pending", "passed", "failed", "skipped"}
        for index, item in enumerate(criteria):
            if not isinstance(item, dict):
                errors.append(f"acceptance_criteria[{index}] must be an object")
                continue
            for key in ("id", "criterion", "status"):
                if key not in item:
                    errors.append(f"acceptance_criteria[{index}] missing required field: {key}")
            status = item.get("status")
            if isinstance(status, str) and status not in ac_statuses:
                errors.append(f"acceptance_criteria[{index}].status must be one of {sorted(ac_statuses)}")
    failure = document.get("failure")
    if isinstance(failure, dict):
        retry = failure.get("retry_count")
        if isinstance(retry, int) and not (0 <= retry <= 3):
            errors.append("failure.retry_count must be between 0 and 3")
    return errors


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({"status": "pass", "fail_open": True, "additional_context": "", "message": "State-watcher input was not JSON; skipped."}))
        return 0

    tool_name = extract_tool_name(payload)
    file_path = extract_file_path(payload)
    basename = PurePosixPath(file_path.replace("\\", "/")).name if file_path else ""

    bridge_tool, bridge_target = _resolve_bridge_call(tool_name, payload)
    is_direct_edit = tool_name in EDIT_TOOLS and basename == "workflow-state.json"

    if not is_direct_edit and not bridge_tool:
        _trace({"hook": "state-watcher", "event": "postToolUse", "status": "pass", "checked": False, "tool_name": tool_name, "file_basename": basename})
        print(json.dumps({"status": "pass", "fail_open": True, "additional_context": "", "checked": False}))
        return 0

    if bridge_tool:
        target = Path(bridge_target).expanduser()
        file_path = bridge_target
    else:
        target = Path(file_path).expanduser()
    if not target.is_absolute():
        target = (ROOT / target).resolve()

    if not target.is_file():
        print(json.dumps({
            "status": "pass",
            "fail_open": True,
            "additional_context": "State-watcher could not read the edited workflow-state file from disk.",
            "checked": False,
            "file_path": file_path,
            "bridge_tool": bridge_tool,
        }, ensure_ascii=False))
        return 0

    try:
        document = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({
            "status": "pass",
            "fail_open": True,
            "additional_context": f"State-watcher could not parse the workflow-state JSON: {exc}.",
            "checked": False,
            "file_path": file_path,
            "bridge_tool": bridge_tool,
        }, ensure_ascii=False))
        return 0

    schema: dict = {}
    if SCHEMA_PATH.is_file():
        try:
            schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            schema = {}

    errors = _validate_against_schema(document, schema if isinstance(schema, dict) else {})
    if errors:
        additional_context = (
            "State-watcher detected schema issues in the edited workflow-state document: "
            + "; ".join(errors[:8])
            + ". Use scripts/validate-workflow-state.py for the full validator output."
        )
        status = "warning"
    else:
        additional_context = (
            "State-watcher confirmed the edited workflow-state document still matches "
            ".cursor/state/workflow-state.schema.json."
        )
        status = "pass"

    _trace({
        "hook": "state-watcher",
        "event": "postToolUse",
        "status": status,
        "checked": True,
        "tool_name": tool_name,
        "bridge_tool": bridge_tool,
        "file_basename": basename,
        "error_count": len(errors),
        "first_errors": errors[:4],
    })
    print(json.dumps({
        "status": status,
        "fail_open": True,
        "checked": True,
        "additional_context": additional_context,
        "file_path": file_path,
        "bridge_tool": bridge_tool,
        "errors": errors[:16],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
