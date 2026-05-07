#!/usr/bin/env python3
"""Validate the structure of mcp/cursor-state-bridge.

Exits 0 and prints MCP_SERVER_STRUCTURE_OK on success.
Exits non-zero with a descriptive message on first failure.
Stdlib only.
"""
from __future__ import annotations

import os
import py_compile
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def note(msg: str) -> None:
    print(f"note: {msg}")


def log(msg: str) -> None:
    print(f"ok: {msg}")


# ---------------------------------------------------------------------------
# 1. Required file presence
# ---------------------------------------------------------------------------

REQUIRED_FILES = [
    "mcp/cursor-state-bridge/__init__.py",
    "mcp/cursor-state-bridge/__main__.py",
    "mcp/cursor-state-bridge/server.py",
    "mcp/cursor-state-bridge/jail.py",
    "mcp/cursor-state-bridge/fixtures/mcp.example.canonical.json",
    "mcp/cursor-state-bridge/fixtures/trace-schema.json",
]

OPTIONAL_FILES = [
    "mcp/cursor-state-bridge/README.md",
]

for rel in REQUIRED_FILES:
    path = ROOT / rel
    if not path.is_file():
        fail(f"missing required file: {rel}")
    log(f"present: {rel}")

for rel in OPTIONAL_FILES:
    path = ROOT / rel
    if not path.is_file():
        note(f"optional file not yet present: {rel}")
    else:
        log(f"present (optional): {rel}")

# ---------------------------------------------------------------------------
# 2. py_compile each .py under mcp/cursor-state-bridge/ excluding tests/
# ---------------------------------------------------------------------------

pkg_dir = ROOT / "mcp" / "cursor-state-bridge"
py_files = [
    p for p in pkg_dir.rglob("*.py")
    if "tests" not in p.relative_to(pkg_dir).parts
]

for py_path in sorted(py_files):
    try:
        py_compile.compile(str(py_path), doraise=True)
    except py_compile.PyCompileError as exc:
        fail(f"syntax error in {py_path.relative_to(ROOT)}: {exc}")
    log(f"compiles: {py_path.relative_to(ROOT)}")

# ---------------------------------------------------------------------------
# 3. No network imports in server.py
# ---------------------------------------------------------------------------

server_py = ROOT / "mcp" / "cursor-state-bridge" / "server.py"
server_text = server_py.read_text(encoding="utf-8")

FORBIDDEN_NETWORK_PATTERNS = [
    r"socket\.socket",
    r"socketserver",
    r"http\.server",
    r"flask",
    r"fastapi",
    r"requests",
    r"urllib\.request",
]

for pattern in FORBIDDEN_NETWORK_PATTERNS:
    if re.search(pattern, server_text):
        fail(f"server.py contains forbidden network import/use: {pattern}")

log("server.py: no forbidden network imports")

# ---------------------------------------------------------------------------
# 4. Required tool name literals in server.py
# ---------------------------------------------------------------------------

REQUIRED_TOOL_NAMES = [
    "state_read",
    "state_init",
    "state_set_phase",
    "state_record_failure",
    "state_update_acceptance_criterion",
    "state_history_append",
]

for tool in REQUIRED_TOOL_NAMES:
    # Match the tool name as a string token (quoted)
    if not re.search(r'["\']' + re.escape(tool) + r'["\']', server_text):
        fail(f"server.py does not contain required tool name as string literal: {tool}")

log(f"server.py: all {len(REQUIRED_TOOL_NAMES)} required tool names present")

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

print("MCP_SERVER_STRUCTURE_OK")
