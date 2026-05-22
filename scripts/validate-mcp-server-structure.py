#!/usr/bin/env python3
"""Validate the structure of mcp/cursor-state-bridge.

Exits 0 and prints MCP_SERVER_STRUCTURE_OK on success.
Exits non-zero with a descriptive message on first failure.
Stdlib only.
"""
from __future__ import annotations

import py_compile
import re
import sys
import importlib.util
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parent.parent


def fail(msg: str) -> NoReturn:
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
# 5. Tool schemas match the state_io handler parameter contract
# ---------------------------------------------------------------------------

sys.path.insert(0, str(pkg_dir))
spec = importlib.util.spec_from_file_location("cursor_state_bridge_server", server_py)
if spec is None or spec.loader is None:
    fail("could not load cursor-state-bridge server module for schema validation")
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)

tools = getattr(server_module, "_TOOLS", None)
if not isinstance(tools, list):
    fail("server.py must expose _TOOLS as a list")
schemas: dict[str, dict] = {}
for tool in tools:
    if not isinstance(tool, dict):
        continue
    name = tool.get("name")
    if not isinstance(name, str):
        continue
    schema = tool.get("inputSchema")
    if not isinstance(schema, dict):
        fail(f"tool {name} missing inputSchema dict")
    schemas[name] = schema

expected_tool_set = set(REQUIRED_TOOL_NAMES)
if set(schemas) != expected_tool_set:
    fail(f"tools/list drift: expected {sorted(expected_tool_set)}, got {sorted(schemas)}")
functional_tools = getattr(server_module, "_FUNCTIONAL_TOOLS", None)
if not isinstance(functional_tools, dict):
    fail("server.py must expose _FUNCTIONAL_TOOLS as a dict")
if set(functional_tools) != expected_tool_set:
    fail(f"functional tool map drift: expected {sorted(expected_tool_set)}, got {sorted(functional_tools)}")
for tool, handler_name in functional_tools.items():
    if not hasattr(server_module._state_io, handler_name):
        fail(f"functional tool {tool} maps to missing state_io handler {handler_name}")
state_handlers = {
    name for name in dir(server_module._state_io)
    if name.startswith("state_") and callable(getattr(server_module._state_io, name))
}
if state_handlers != expected_tool_set:
    fail(f"state_io handler drift: expected {sorted(expected_tool_set)}, got {sorted(state_handlers)}")
capabilities = server_module.Server(str(ROOT))._handle_initialize().get("capabilities")
if capabilities != {"tools": {}}:
    fail(f"cursor-state-bridge must advertise only tools capability, got {capabilities!r}")

EXPECTED_SCHEMA_PROPERTIES = {
    "state_read": {"task_id", "workspace"},
    "state_init": {
        "task_id",
        "plan_id",
        "title",
        "phase",
        "status",
        "role",
        "next_action",
        "scope_per_task",
        "history_cap",
    },
    "state_set_phase": {
        "task_id",
        "phase",
        "status",
        "role",
        "next_action",
        "note",
        "history_cap",
    },
    "state_record_failure": {"task_id", "message", "type", "note", "retry_count", "history_cap"},
    "state_update_acceptance_criterion": {
        "task_id",
        "ac_id",
        "status",
        "criterion",
        "evidence",
        "note",
        "history_cap",
    },
    "state_history_append": {"task_id", "event", "note", "phase", "status", "history_cap"},
}

for tool, expected_props in EXPECTED_SCHEMA_PROPERTIES.items():
    schema = schemas.get(tool)
    if not isinstance(schema, dict):
        fail(f"{tool} missing inputSchema")
    props = schema.get("properties")
    if not isinstance(props, dict):
        fail(f"{tool} inputSchema missing properties")
    actual_props = set(props)
    if actual_props != expected_props:
        fail(f"{tool} schema properties drift: expected {sorted(expected_props)}, got {sorted(actual_props)}")

failure_props = schemas["state_record_failure"]["properties"]
if "phase" in failure_props:
    fail("state_record_failure schema must not advertise unused phase param")
if "type" not in failure_props:
    fail("state_record_failure schema must advertise failure type")

history_schema = schemas["state_history_append"]
if history_schema.get("required") != ["task_id"]:
    fail("state_history_append should require task_id and accept event or note")
if not isinstance(history_schema.get("anyOf"), list):
    fail("state_history_append should express event/note alias via anyOf")

log("server.py: MCP tool schemas match state_io handler contract")

state_io_py = pkg_dir / "state_io.py"
state_io_text = state_io_py.read_text(encoding="utf-8")
if "oh_my_cursor.workflow_state" not in state_io_text:
    fail("state_io.py must import the packaged workflow-state API")
if "spec_from_file_location" in state_io_text or "workflow-state.py" in state_io_text:
    fail("state_io.py must not importlib-load workspace workflow-state.py")
if "resolved outside the trusted payload" not in state_io_text:
    fail("state_io.py must verify the packaged workflow-state API provenance")
log("state_io.py: imports packaged workflow-state API, not workspace Python")


# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

print("MCP_SERVER_STRUCTURE_OK")
