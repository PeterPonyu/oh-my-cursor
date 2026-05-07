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
from pathlib import Path
from typing import Any

from jail import JailError, resolve_jailed

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

        try:
            if method == "initialize":
                _send(_ok(req_id, self._handle_initialize()))
            elif method == "tools/list":
                _send(_ok(req_id, self._handle_tools_list()))
            elif method == "tools/call":
                result = self._handle_tools_call(req_id, params)
                # _handle_tools_call sends the response itself (may be error or ok)
                # to avoid double-send, return early when it handled sending.
                return
            else:
                _send(_err(req_id, -32601, f"unknown method: {method}"))
        except JailError as exc:
            _send(_err(req_id, -32602, str(exc)))
        except Exception as exc:  # noqa: BLE001
            _send(_err(req_id, -32603, f"internal error: {exc}"))

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

        if tool_name == "state_read":
            try:
                result = self._tool_state_read(tool_params)
                _send(_ok(req_id, result))
            except JailError as exc:
                _send(_err(req_id, -32602, str(exc)))
            except Exception as exc:  # noqa: BLE001
                _send(_err(req_id, -32603, f"internal error: {exc}"))
        elif tool_name in {
            "state_init",
            "state_set_phase",
            "state_record_failure",
            "state_update_acceptance_criterion",
            "state_history_append",
        }:
            _send(_err(req_id, -32601, _NOT_IMPLEMENTED_MSG))
        else:
            _send(_err(req_id, -32601, f"unknown tool: {tool_name}"))

    # ------------------------------------------------------------------
    # state_read implementation
    # ------------------------------------------------------------------

    def _tool_state_read(self, params: dict[str, Any]) -> dict[str, Any]:
        """Read workflow-state.json; return MCP content response."""
        workspace_str = params.get("workspace")
        workspace = Path(workspace_str).resolve() if workspace_str else self._workspace

        task_id = params.get("task_id") or ""

        if task_id:
            target = workspace / "docs" / "plans" / task_id / "workflow-state.json"
        else:
            target = workspace / ".cursor" / "state" / "workflow-state.json"

        # Validate jail containment before any IO.
        resolve_jailed(workspace, target)

        if not target.exists():
            return {"content": [{"type": "text", "text": "no state"}]}

        try:
            parsed = json.loads(target.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"state file parse error: {exc}") from exc

        return {"content": [{"type": "text", "text": json.dumps(parsed)}]}
