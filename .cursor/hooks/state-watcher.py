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

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / ".cursor" / "state" / "workflow-state.schema.json"

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

    tool_name = _extract_tool_name(payload)
    file_path = _extract_file_path(payload)
    basename = PurePosixPath(file_path.replace("\\", "/")).name if file_path else ""

    if tool_name not in EDIT_TOOLS or basename != "workflow-state.json":
        _trace({"hook": "state-watcher", "event": "postToolUse", "status": "pass", "checked": False, "tool_name": tool_name, "file_basename": basename})
        print(json.dumps({"status": "pass", "fail_open": True, "additional_context": "", "checked": False}))
        return 0

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
        "errors": errors[:16],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
