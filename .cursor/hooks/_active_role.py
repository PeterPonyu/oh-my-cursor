"""Active subagent role tracking + agent frontmatter parsing.

This helper is the shared source of truth for `tool-guard.py`,
`subagent-bootstrap.py`, and `subagent-summary.py`. It records which
checked-in role prompt (if any) is currently driving subagent work, and
lets the pre-tool gate consult that prompt's `tools:` allowlist.

State lives at `.cursor/state/active-role.json`. Writes are serialised
through the same `file_lock` the workflow-state writers use, so a
concurrent subagentStart/subagentStop cannot interleave a partial
document. The contract is single-active-subagent: each `set_active_role`
overwrites; `clear_active_role` deletes the file.

Frontmatter parsing is regex-based and handles the narrow subset this
project uses:

- `key: value` strings
- `key: true|false` booleans
- `key: [a, b, c]` inline YAML lists

Stdlib-only.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# `_locking.file_lock` lives under `.cursor/state/`; expose it for shared
# write serialisation. The path math mirrors how the bridge's `state_io.py`
# locates the same module.
_HOOKS_DIR = Path(__file__).resolve().parent
_ROOT = _HOOKS_DIR.parents[1]
_STATE_DIR = _ROOT / ".cursor" / "state"
if str(_STATE_DIR) not in sys.path:
    sys.path.insert(0, str(_STATE_DIR))

try:
    from _locking import file_lock  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - degraded mode for non-POSIX hosts
    from contextlib import contextmanager

    @contextmanager
    def file_lock(_target):  # type: ignore[no-redef]
        yield


ACTIVE_ROLE_PATH = _STATE_DIR / "active-role.json"
AGENTS_DIR = _ROOT / ".cursor" / "agents"


def set_active_role(role: str, *, subagent_id: str = "") -> None:
    """Record `role` as the active subagent. Overwrites any prior entry."""
    if not isinstance(role, str) or not role:
        return
    payload = {
        "role": role,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "subagent_id": subagent_id or "",
    }
    ACTIVE_ROLE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with file_lock(ACTIVE_ROLE_PATH):
        tmp = ACTIVE_ROLE_PATH.with_suffix(ACTIVE_ROLE_PATH.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
        tmp.replace(ACTIVE_ROLE_PATH)


def clear_active_role() -> None:
    """Remove the active-role record. No-op when the file is absent."""
    with file_lock(ACTIVE_ROLE_PATH):
        try:
            ACTIVE_ROLE_PATH.unlink()
        except FileNotFoundError:
            return


def get_active_role() -> str | None:
    """Return the active role name, or None when no subagent is running."""
    try:
        data = json.loads(ACTIVE_ROLE_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    if not isinstance(data, dict):
        return None
    role = data.get("role")
    if isinstance(role, str) and role:
        return role
    return None


_LIST_RE = re.compile(r"^\s*\[(.*)\]\s*$")


def _parse_value(raw: str) -> Any:
    raw = raw.strip()
    if raw == "":
        return ""
    if raw.lower() in {"true", "false"}:
        return raw.lower() == "true"
    list_match = _LIST_RE.match(raw)
    if list_match:
        body = list_match.group(1).strip()
        if not body:
            return []
        items: list[str] = []
        for chunk in body.split(","):
            item = chunk.strip().strip('"').strip("'")
            if item:
                items.append(item)
        return items
    if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
        return raw[1:-1]
    return raw


def parse_agent_frontmatter(role: str) -> dict[str, Any]:
    """Return the parsed frontmatter dict for the given role, or {}."""
    if not isinstance(role, str) or not role:
        return {}
    agent_file = AGENTS_DIR / f"{role}.md"
    try:
        text = agent_file.read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return {}
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    block = parts[1]
    result: dict[str, Any] = {}
    for line in block.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, raw_value = line.partition(":")
        key = key.strip()
        if not key:
            continue
        result[key] = _parse_value(raw_value)
    return result


def agent_tools_allowlist(role: str) -> list[str] | None:
    """Return the agent's declared `tools:` allowlist, or None when absent."""
    fm = parse_agent_frontmatter(role)
    tools = fm.get("tools")
    if isinstance(tools, list):
        return [t for t in tools if isinstance(t, str) and t]
    return None


def agent_is_readonly(role: str) -> bool | None:
    """Return the agent's declared `readonly:` flag, or None when absent."""
    fm = parse_agent_frontmatter(role)
    flag = fm.get("readonly")
    if isinstance(flag, bool):
        return flag
    return None
