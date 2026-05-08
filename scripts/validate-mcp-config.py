#!/usr/bin/env python3
"""Validate the Cursor MCP configuration for oh-my-cursor.

Checks two things:

1. The plugin manifest at `.cursor-plugin/plugin.json` declares an `mcp` field
   pointing to a readable example/template file (default `.cursor/mcp.example.json`).
2. A user-side `.cursor/mcp.json` exists. When present, it must be valid JSON,
   declare the `cursor-state-bridge` server, and not contain the literal
   placeholder token `<placeholder>`.

Exits 0 with a human-readable report. Returns a non-zero status only on
unrecoverable errors (e.g., invalid JSON in the plugin manifest). Missing
`.cursor/mcp.json` produces a WARN, not an error — local plugin installs
that have not yet been activated by the user are still considered valid.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN_MANIFEST = ROOT / ".cursor-plugin" / "plugin.json"
DEFAULT_MCP_EXAMPLE = ROOT / ".cursor" / "mcp.example.json"
USER_MCP_CONFIG = ROOT / ".cursor" / "mcp.json"
PLACEHOLDER_TOKEN = "<placeholder>"
REQUIRED_SERVER = "cursor-state-bridge"


def _load_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as exc:
        print(f"FAIL: {path} is not valid JSON: {exc}")
        raise SystemExit(2)


def _check_manifest() -> Path:
    manifest = _load_json(PLUGIN_MANIFEST)
    if manifest is None:
        print(f"FAIL: plugin manifest missing at {PLUGIN_MANIFEST.relative_to(ROOT)}")
        raise SystemExit(2)
    mcp_field = manifest.get("mcp")
    if not isinstance(mcp_field, str) or not mcp_field:
        print(f"WARN: plugin.json has no `mcp` field; defaulting to {DEFAULT_MCP_EXAMPLE.relative_to(ROOT)}")
        return DEFAULT_MCP_EXAMPLE
    target = (ROOT / mcp_field).resolve()
    if not target.is_file():
        print(f"FAIL: plugin.json `mcp` points to missing file {mcp_field}")
        raise SystemExit(2)
    return target


def _check_example(example_path: Path) -> bool:
    example = _load_json(example_path)
    if example is None:
        print(f"FAIL: MCP example missing at {example_path.relative_to(ROOT)}")
        return False
    servers = example.get("mcpServers")
    if not isinstance(servers, dict) or REQUIRED_SERVER not in servers:
        print(f"FAIL: {example_path.relative_to(ROOT)} does not declare `{REQUIRED_SERVER}` under mcpServers")
        return False
    return True


def _check_user_config() -> bool:
    if not USER_MCP_CONFIG.is_file():
        print(
            f"WARN: {USER_MCP_CONFIG.relative_to(ROOT)} not present. Cursor will not auto-load the bridge "
            f"until you copy {DEFAULT_MCP_EXAMPLE.relative_to(ROOT)} -> {USER_MCP_CONFIG.relative_to(ROOT)}."
        )
        return True
    user = _load_json(USER_MCP_CONFIG)
    if user is None:
        return False
    servers = user.get("mcpServers", {})
    if not isinstance(servers, dict) or REQUIRED_SERVER not in servers:
        print(
            f"WARN: {USER_MCP_CONFIG.relative_to(ROOT)} does not declare `{REQUIRED_SERVER}`. "
            f"The bridge will not be reachable through this config."
        )
        return True
    raw = USER_MCP_CONFIG.read_text(encoding="utf-8")
    if PLACEHOLDER_TOKEN in raw:
        print(
            f"FAIL: {USER_MCP_CONFIG.relative_to(ROOT)} contains literal `{PLACEHOLDER_TOKEN}` token. "
            "Replace with a real OH_MY_CURSOR_MCP_TOKEN value or remove the env block (auth defaults OFF)."
        )
        return False
    print(f"OK: {USER_MCP_CONFIG.relative_to(ROOT)} declares `{REQUIRED_SERVER}` and contains no placeholder token.")
    return True


def main() -> int:
    example_path = _check_manifest()
    if not _check_example(example_path):
        return 1
    print(f"OK: plugin manifest declares MCP at {example_path.relative_to(ROOT)} with `{REQUIRED_SERVER}`.")
    if not _check_user_config():
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
