#!/usr/bin/env python3
"""subagentStart hook: link subagent runs to checked-in role prompts.

Fires before a subagent (Task tool) spawns. The hook always allows the
subagent to start. When the `subagent_type` matches a checked-in role under
`.cursor/agents/`, the hook adds a short `user_message` pointing at the
matching prompt file so the subagent uses the repo-owned definition rather
than reinventing one.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
AGENTS_DIR = ROOT / ".cursor" / "agents"

KNOWN_ROLES = {
    "orchestrator",
    "researcher",
    "planner",
    "verifier",
    "critic",
    "debugger",
    "security-reviewer",
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
        print(json.dumps({"status": "pass", "fail_open": True, "permission": "allow", "user_message": "Subagent-bootstrap input was not JSON; skipped."}))
        return 0

    subagent_type = ""
    for key in ("subagent_type", "subagentType", "type"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            subagent_type = value.lower()
            break

    role_match = subagent_type in KNOWN_ROLES
    role_prompt_path = AGENTS_DIR / f"{subagent_type}.md" if role_match else None
    role_prompt_exists = bool(role_prompt_path and role_prompt_path.is_file())

    if role_match and role_prompt_exists:
        user_message = (
            f"Subagent-bootstrap: matched role `{subagent_type}`. "
            f"Use the checked-in prompt at .cursor/agents/{subagent_type}.md "
            "and stay within its readonly contract."
        )
        status = "matched"
    else:
        user_message = (
            "Subagent-bootstrap: no matching repo-owned role prompt for "
            + (f"`{subagent_type}`" if subagent_type else "this subagent")
            + ". Free-form subagent runs are allowed; check .cursor/agents/ for a closer match."
        )
        status = "pass"

    output = {
        "status": status,
        "fail_open": True,
        "permission": "allow",
        "user_message": user_message,
        "subagent_type": subagent_type,
        "role_prompt": role_prompt_path.relative_to(ROOT).as_posix() if role_prompt_exists else None,
    }
    _trace({
        "hook": "subagent-bootstrap",
        "event": "subagentStart",
        "status": status,
        "subagent_type": subagent_type,
        "role_match": role_match,
        "role_prompt_exists": role_prompt_exists,
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
