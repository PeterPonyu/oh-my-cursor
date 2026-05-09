#!/usr/bin/env python3
"""beforeReadFile hook: observational advisor for repo-owned reads.

Fires before the agent reads a file. The hook always allows the read and
never modifies content. When the target file is part of the repo-owned
state-contract surface (`.cursor/state/workflow-state*.json`), it appends a
short `user_message` reminding the reader that the document is human-visible
and bounded by the schema, so summaries stay aligned with the contract.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path, PurePosixPath

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402


STATE_BASENAMES = {
    "workflow-state.json",
    "workflow-state.example.json",
    "workflow-state.schema.json",
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
        print(json.dumps({"status": "pass", "fail_open": True, "permission": "allow", "user_message": "Read-advisor input was not JSON; skipped."}))
        return 0

    file_path = ""
    for key in ("file_path", "filePath", "path"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            file_path = value
            break
    basename = PurePosixPath(file_path.replace("\\", "/")).name if file_path else ""

    if basename in STATE_BASENAMES:
        user_message = (
            "Read-advisor: this is a workflow-state document under .cursor/state/. "
            "It is human-visible, schema-bounded (.cursor/state/workflow-state.schema.json), "
            "and only edited through the writer at .cursor/state/workflow-state.py."
        )
        status = "advised"
    else:
        user_message = ""
        status = "pass"

    output = {
        "status": status,
        "fail_open": True,
        "permission": "allow",
        "user_message": user_message,
        "file_path": file_path,
    }
    _trace({
        "hook": "read-advisor",
        "event": "beforeReadFile",
        "status": status,
        "file_basename": basename,
        "is_state_file": basename in STATE_BASENAMES,
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
