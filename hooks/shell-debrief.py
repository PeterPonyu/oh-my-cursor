#!/usr/bin/env python3
"""afterShellExecution hook: surface evidence notes for repo-owned scripts.

Fires after a shell command completes. The hook is observational: when the
recorded command invoked one of the repo-owned validators, smokes,
install/check helpers, or the workflow-state writer, the hook emits an
`additional_context` note that links the result to the corresponding
checked-in proof artifact. Other commands pass through silently.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402


PROOF_PATTERNS = (
    (re.compile(r"\bscripts/validate-([A-Za-z0-9_-]+)\.(?:py|sh)\b"), "validator"),
    (re.compile(r"\bscripts/smoke-([A-Za-z0-9_-]+)\.sh\b"), "smoke"),
    (re.compile(r"\bscripts/check-([A-Za-z0-9_-]+)\.sh\b"), "check"),
    (re.compile(r"\bscripts/verify-([A-Za-z0-9_-]+)\.sh\b"), "verify"),
    (re.compile(r"\bscripts/install-local-plugin\.sh\b"), "installer"),
    (re.compile(r"\b\.cursor/state/workflow-state\.py\b"), "state-writer"),
    (re.compile(r"\bscripts/workflow-state\.py\b"), "state-writer"),
)

PROOF_CLASS = {
    "validator": "checked-in-artifact",
    "smoke": "checked-in-artifact",
    "check": "checked-in-artifact",
    "verify": "checked-in-artifact",
    "installer": "checked-in-artifact",
    "state-writer": "checked-in-artifact",
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
        print(json.dumps({"status": "pass", "fail_open": True, "additional_context": "", "message": "Shell-debrief input was not JSON; skipped."}))
        return 0

    command = ""
    for key in ("command", "commandLine", "command_line", "cmd"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            command = value
            break

    matches: list[dict[str, str]] = []
    for pattern, kind in PROOF_PATTERNS:
        match = pattern.search(command)
        if match:
            matches.append({
                "kind": kind,
                "match": match.group(0),
                "proof_class": PROOF_CLASS.get(kind, ""),
            })

    if matches:
        labels = ", ".join(f"{item['kind']}={item['match']}" for item in matches)
        additional_context = (
            "Shell-debrief noticed a repo-owned proof command in this run: "
            + labels
            + ". Treat its output as checked-in-artifact evidence when updating acceptance criteria."
        )
        status = "matched"
    else:
        additional_context = ""
        status = "pass"

    output = {
        "status": status,
        "fail_open": True,
        "additional_context": additional_context,
        "command_excerpt": command[:200],
        "matches": matches,
    }
    _trace({
        "hook": "shell-debrief",
        "event": "afterShellExecution",
        "status": status,
        "command_excerpt": command[:120],
        "match_count": len(matches),
        "match_kinds": [item.get("kind") for item in matches],
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
