#!/usr/bin/env python3
"""beforeShellExecution hook: warn on risky shell commands.

Reads the proposed shell command, scans for risky and severe patterns, and
emits a structured JSON decision.

Pattern policy stays narrow on purpose so the hook does not turn into a
discretionary gate for ordinary work:

- **warning** patterns (force-push, --no-verify, rm -rf, hard reset, branch -D,
  checkout discard) keep `permission=allow`; the hook just surfaces a reminder
  through `user_facing_message`.
- **severe** patterns are tightly bounded to operations that would corrupt
  repo-owned state files (`.cursor/state/workflow-state*.json`) or the local
  plugin install path (`~/.cursor/plugins/local/oh-my-cursor`). These set
  `permission=ask` so Cursor can confirm with the user before executing.

The hook itself never deletes anything, never rewrites the command, and always
exits 0. Cursor consumes the `permission` field, not the exit code.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402


COMMAND_FIELDS = ("command", "commandLine", "command_line", "shell", "cmd", "input")

WARNING_PATTERNS = {
    "force-push": re.compile(r"\bgit\s+push\b[^|;&]*--force(?:-with-lease)?\b", re.IGNORECASE),
    "skip-hooks": re.compile(r"--no-verify\b", re.IGNORECASE),
    "skip-gpg-sign": re.compile(r"--no-gpg-sign\b", re.IGNORECASE),
    "rm-rf-broad": re.compile(r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b", re.IGNORECASE),
    "git-reset-hard": re.compile(r"\bgit\s+reset\s+--hard\b", re.IGNORECASE),
    "git-clean-force": re.compile(r"\bgit\s+clean\b[^|;&]*-[A-Za-z]*f[A-Za-z]*\b", re.IGNORECASE),
    "checkout-discard": re.compile(r"\bgit\s+checkout\s+--\s+\.", re.IGNORECASE),
    "branch-delete-force": re.compile(r"\bgit\s+branch\b[^|;&]*-D\b", re.IGNORECASE),
}

SEVERE_PATTERNS = {
    "destroy-state-file": re.compile(
        r"\b(?:rm|truncate|sed|awk|tee)\b[^|;&]*\.cursor/state/workflow-state(?:\.schema|\.example)?\.json\b",
        re.IGNORECASE,
    ),
    "redirect-overwrite-state-file": re.compile(
        r">\s*\"?\.cursor/state/workflow-state(?:\.schema|\.example)?\.json\b",
        re.IGNORECASE,
    ),
    "destroy-local-plugin-install": re.compile(
        r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b[^|;&]*~?/?\.cursor/plugins/local/oh-my-cursor\b",
        re.IGNORECASE,
    ),
    "destroy-local-plugin-root": re.compile(
        r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b[^|;&]*~?/?\.cursor/plugins/local/?\s*$",
        re.IGNORECASE,
    ),
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


def _extract_command(payload: dict) -> str:
    for key in COMMAND_FIELDS:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    for nested_key in ("tool", "arguments", "tool_call", "toolCall"):
        nested = payload.get(nested_key) if isinstance(payload, dict) else None
        if isinstance(nested, dict):
            for key in COMMAND_FIELDS:
                value = nested.get(key)
                if isinstance(value, str) and value.strip():
                    return value
    return ""


def _scan(command: str, patterns: dict[str, re.Pattern[str]]) -> list[str]:
    matched: list[str] = []
    for label, pattern in patterns.items():
        if pattern.search(command):
            matched.append(label)
    return matched


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({
            "status": "pass",
            "fail_open": True,
            "permission": "allow",
            "user_facing_message": "Shell-guard input was not JSON; skipped.",
        }))
        return 0

    command = _extract_command(payload)
    warnings = _scan(command, WARNING_PATTERNS)
    severe = _scan(command, SEVERE_PATTERNS)

    if severe:
        permission = "ask"
        message = (
            "Shell-guard flagged a severe pattern that would corrupt repo-owned state or the local plugin install: "
            + ", ".join(severe)
            + ". Use scripts/workflow-state.py for state edits and scripts/install-local-plugin.sh for the local plugin path."
        )
        status = "severe"
    elif warnings:
        permission = "allow"
        message = (
            "Shell-guard noticed risky patterns: "
            + ", ".join(warnings)
            + ". Confirm the command is intentional before continuing."
        )
        status = "warning"
    else:
        permission = "allow"
        message = "Shell-guard saw no risky patterns."
        status = "pass"

    output = {
        "status": status,
        "fail_open": not severe,
        "permission": permission,
        "user_facing_message": message,
        "command_excerpt": command[:200],
        "warnings": warnings,
        "severe": severe,
    }
    _trace({
        "hook": "shell-guard",
        "event": "beforeShellExecution",
        "status": status,
        "permission": permission,
        "command_excerpt": command[:120],
        "warnings": warnings,
        "severe": severe,
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
