"""JSON-RPC 2.0 over stdio server for cursor-state-bridge.

Protocol: line-delimited JSON-RPC 2.0 (no Content-Length framing).
Each request is one JSON object per stdin line.
Each response is one JSON object per stdout line followed by a flush.

Constraints (enforced):
- Stdlib only; no third-party imports.
- No TCP/UDP sockets; stdio only.
- Fail-open: unexpected internal errors produce JSON-RPC error responses, not crashes.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any

from jail import JailError
import state_io as _state_io
import _trace as _bridge_trace
import auth as _bridge_auth

# ---------------------------------------------------------------------------
# Tool definitions (advertised by tools/list)
# ---------------------------------------------------------------------------

_TOOLS: list[dict[str, Any]] = [
    {
        "name": "state_read",
        "description": (
            "Read the current workflow state. If task_id is provided, reads "
            "<workspace>/docs/plans/<task_id>/workflow-state.json; otherwise reads "
            "<workspace>/.cursor/state/workflow-state.json."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Optional task identifier; selects per-task state file.",
                },
                "workspace": {
                    "type": "string",
                    "description": "Optional workspace path override; defaults to startup --workspace arg.",
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "state_init",
        "description": "Initialise a new workflow-state file for the given task.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "plan_id": {"type": "string"},
            },
            "required": ["task_id"],
            "additionalProperties": True,
        },
    },
    {
        "name": "state_set_phase",
        "description": "Advance the workflow phase for a task.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "phase": {"type": "string"},
                "status": {"type": "string"},
            },
            "required": ["task_id", "phase"],
            "additionalProperties": False,
        },
    },
    {
        "name": "state_record_failure",
        "description": "Record a failure event for a task.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "message": {"type": "string"},
                "phase": {"type": "string"},
                "retry_count": {"type": "integer"},
            },
            "required": ["task_id", "message"],
            "additionalProperties": False,
        },
    },
    {
        "name": "state_update_acceptance_criterion",
        "description": "Update a single acceptance criterion for a task.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "ac_id": {"type": "string"},
                "status": {"type": "string"},
                "evidence": {
                    "type": "string",
                    "description": "Optional reference to a checked-in artifact or script output.",
                },
            },
            "required": ["task_id", "ac_id", "status"],
            "additionalProperties": False,
        },
    },
    {
        "name": "state_history_append",
        "description": "Append a single history event for a task.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "event": {"type": "string"},
            },
            "required": ["task_id", "event"],
            "additionalProperties": True,
        },
    },
]

# ---------------------------------------------------------------------------
# JSON-RPC helpers
# ---------------------------------------------------------------------------

_NOT_IMPLEMENTED_MSG = "method not implemented in this PR (Phase 3)"

# Tools whose handlers route through state_io (functional after Phase 3).
_FUNCTIONAL_TOOLS: dict[str, str] = {
    "state_read": "state_read",
    "state_init": "state_init",
    "state_set_phase": "state_set_phase",
    "state_record_failure": "state_record_failure",
    "state_update_acceptance_criterion": "state_update_acceptance_criterion",
    "state_history_append": "state_history_append",
}

# No placeholder tools remain after Phase 3; kept as an empty set so the
# dispatch arm in _handle_tools_call still type-checks if Phase-X work
# reintroduces a placeholder later.
_PLACEHOLDER_TOOLS: set[str] = set()


def _ok(req_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _err(req_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _send(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------


class Server:
    """Stdio JSON-RPC 2.0 server for cursor-state-bridge."""

    def __init__(self, workspace: str, task_id: str = "") -> None:
        self._workspace = Path(workspace).resolve()
        self._task_id = task_id
        # Auth state: when expected_token() is non-None at startup, the
        # client must complete a successful initialize handshake before
        # any other call is honoured.  Default OFF.
        self._auth_required = _bridge_auth.expected_token() is not None
        self._auth_passed = not self._auth_required

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def serve(self) -> None:
        """Run the stdio loop until EOF.  Returns normally on clean EOF."""
        for raw_line in sys.stdin:
            line = raw_line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except json.JSONDecodeError as exc:
                _send(_err(None, -32700, f"parse error: {exc}"))
                continue
            self._dispatch(req)

    # ------------------------------------------------------------------
    # Dispatch
    # ------------------------------------------------------------------

    def _dispatch(self, req: Any) -> None:
        req_id = req.get("id") if isinstance(req, dict) else None
        method = req.get("method", "") if isinstance(req, dict) else ""
        params = req.get("params", {}) if isinstance(req, dict) else {}

        start = time.monotonic()
        result_label = "ok"
        error_class = ""
        tool_label = method or ""
        task_id_label = ""

        try:
            if method == "initialize":
                # Auth shake (Phase 6).  When OH_MY_CURSOR_MCP_TOKEN is
                # exported, the initialize params MUST carry a matching
                # token; otherwise return -32001 unauthorized and refuse
                # to advance the session.
                if not _bridge_auth.authenticate(params):
                    self._auth_passed = False
                    _send(_err(req_id, -32001, "unauthorized: missing or invalid OH_MY_CURSOR_MCP_TOKEN"))
                    result_label = "error"
                    error_class = "-32001"
                else:
                    self._auth_passed = True
                    _send(_ok(req_id, self._handle_initialize()))
            elif self._auth_required and not self._auth_passed:
                _send(_err(req_id, -32001, "unauthorized: complete initialize with OH_MY_CURSOR_MCP_TOKEN first"))
                result_label = "error"
                error_class = "-32001"
            elif method == "tools/list":
                _send(_ok(req_id, self._handle_tools_list()))
            elif method == "tools/call":
                if isinstance(params, dict):
                    tool_label = params.get("name", "") or method
                    args = params.get("arguments") or {}
                    if isinstance(args, dict) and isinstance(args.get("task_id"), str):
                        task_id_label = args["task_id"]
                self._handle_tools_call(req_id, params)
                # _handle_tools_call sends the response itself; trace below.
            else:
                _send(_err(req_id, -32601, f"unknown method: {method}"))
                result_label = "error"
                error_class = "-32601"
        except JailError as exc:
            _send(_err(req_id, -32602, str(exc)))
            result_label = "error"
            error_class = "-32602"
        except Exception as exc:  # noqa: BLE001
            _send(_err(req_id, -32603, f"internal error: {exc}"))
            result_label = "error"
            error_class = "-32603"
        finally:
            duration_ms = (time.monotonic() - start) * 1000.0
            record: dict[str, Any] = {
                "tool": tool_label,
                "phase": method or "?",
                "result": result_label,
                "duration_ms": round(duration_ms, 3),
            }
            if task_id_label:
                record["task_id"] = task_id_label
            if error_class:
                record["error_class"] = error_class
            _bridge_trace.trace(self._workspace, record)

    # ------------------------------------------------------------------
    # Method handlers
    # ------------------------------------------------------------------

    def _handle_initialize(self) -> dict[str, Any]:
        return {
            "protocolVersion": "2024-11-05",
            "serverInfo": {"name": "cursor-state-bridge", "version": "0.1.0"},
            "capabilities": {"tools": {}},
        }

    def _handle_tools_list(self) -> dict[str, Any]:
        return {"tools": _TOOLS}

    def _handle_tools_call(self, req_id: Any, params: Any) -> None:
        """Dispatch a tools/call request.  Sends the response directly."""
        if not isinstance(params, dict):
            _send(_err(req_id, -32600, "invalid params: expected object"))
            return

        tool_name = params.get("name", "")
        tool_params = params.get("arguments", {}) or {}

        if tool_name in _FUNCTIONAL_TOOLS:
            handler = getattr(_state_io, _FUNCTIONAL_TOOLS[tool_name])
            try:
                result = handler(self._workspace, tool_params)
                _send(_ok(req_id, result))
            except JailError as exc:
                _send(_err(req_id, -32602, str(exc)))
            except (ValueError, TypeError, KeyError) as exc:
                _send(_err(req_id, -32602, f"invalid params: {exc}"))
            except SystemExit as exc:
                # The library raises SystemExit("FAIL: ...") on schema-enum
                # violations.  Surface as JSON-RPC -32602 instead of crashing.
                msg = str(exc.code) if isinstance(exc.code, str) else "validation error"
                _send(_err(req_id, -32602, f"invalid params: {msg}"))
            except Exception as exc:  # noqa: BLE001
                _send(_err(req_id, -32603, f"internal error: {exc}"))
        elif tool_name in _PLACEHOLDER_TOOLS:
            _send(_err(req_id, -32601, _NOT_IMPLEMENTED_MSG))
        else:
            _send(_err(req_id, -32601, f"unknown tool: {tool_name}"))
