"""JSON-RPC framing tests for cursor-state-bridge.

Covers:
  - initialize handshake
  - tools/list (six tools)
  - unknown method -> -32601
  - malformed JSON -> -32700 (server recovers)
  - state_read happy path via tools/call
  - unimplemented tool -> -32601
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BRIDGE_MAIN = REPO_ROOT / "mcp" / "cursor-state-bridge" / "__main__.py"
BRIDGE_AVAILABLE = BRIDGE_MAIN.is_file()

EXPECTED_TOOL_NAMES = {
    "state_read",
    "state_init",
    "state_set_phase",
    "state_record_failure",
    "state_update_acceptance_criterion",
    "state_history_append",
}


class BridgeProcess:
    """Spawn the bridge as a subprocess; expose send(req)->response."""

    def __init__(self, workspace: Path) -> None:
        self.workspace = workspace
        self.proc = subprocess.Popen(
            [
                sys.executable,
                str(REPO_ROOT / "mcp" / "cursor-state-bridge" / "__main__.py"),
                "--workspace",
                str(workspace),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def send(self, request: dict) -> dict:
        self.proc.stdin.write(json.dumps(request) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            err = self.proc.stderr.read()
            raise RuntimeError(f"no response; stderr: {err}")
        return json.loads(line)

    def send_raw(self, raw: str) -> dict:
        """Write raw bytes to stdin (for malformed-JSON tests)."""
        self.proc.stdin.write(raw + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            err = self.proc.stderr.read()
            raise RuntimeError(f"no response; stderr: {err}")
        return json.loads(line)

    def close(self) -> None:
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=2)
        except Exception:
            self.proc.kill()
            self.proc.wait(timeout=2)


@unittest.skipUnless(BRIDGE_AVAILABLE, "bridge core not yet on disk (Track A in progress)")
class TestRPC(unittest.TestCase):

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._workspace = Path(self._tmpdir.name)
        self._bridge = BridgeProcess(self._workspace)

    def tearDown(self) -> None:
        self._bridge.close()
        self._tmpdir.cleanup()

    # ------------------------------------------------------------------
    # 1. initialize
    # ------------------------------------------------------------------

    def test_initialize_returns_protocol_info(self) -> None:
        resp = self._bridge.send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
        self.assertEqual(resp.get("id"), 1)
        result = resp.get("result", {})
        self.assertIn("protocolVersion", result, "result.protocolVersion missing")
        server_info = result.get("serverInfo", {})
        self.assertEqual(
            server_info.get("name"),
            "cursor-state-bridge",
            f"serverInfo.name mismatch: {server_info}",
        )
        self.assertIn("capabilities", result, "result.capabilities missing")

    # ------------------------------------------------------------------
    # 2. tools/list
    # ------------------------------------------------------------------

    def test_tools_list_returns_six_tools(self) -> None:
        resp = self._bridge.send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        result = resp.get("result", {})
        tools = result.get("tools", [])
        self.assertEqual(
            len(tools),
            6,
            f"expected 6 tools, got {len(tools)}: {[t.get('name') for t in tools]}",
        )
        names = {t.get("name") for t in tools}
        self.assertEqual(names, EXPECTED_TOOL_NAMES, f"tool name mismatch: {names}")

    # ------------------------------------------------------------------
    # 3. unknown method -> -32601
    # ------------------------------------------------------------------

    def test_unknown_method_returns_minus_32601(self) -> None:
        resp = self._bridge.send({"jsonrpc": "2.0", "id": 3, "method": "frobnicate", "params": {}})
        error = resp.get("error", {})
        self.assertEqual(
            error.get("code"),
            -32601,
            f"expected error code -32601, got: {resp}",
        )

    # ------------------------------------------------------------------
    # 4. malformed JSON -> -32700, server recovers
    # ------------------------------------------------------------------

    def test_malformed_json_does_not_crash(self) -> None:
        # Send invalid JSON first
        resp = self._bridge.send_raw("{not valid json")
        error = resp.get("error", {})
        self.assertEqual(
            error.get("code"),
            -32700,
            f"expected parse error -32700, got: {resp}",
        )
        # Server must still respond to a normal request after recovery
        resp2 = self._bridge.send(
            {"jsonrpc": "2.0", "id": 4, "method": "tools/list", "params": {}}
        )
        result = resp2.get("result", {})
        tools = result.get("tools", [])
        self.assertEqual(len(tools), 6, f"server did not recover; resp: {resp2}")

    # ------------------------------------------------------------------
    # 5. state_read happy path via tools/call
    # ------------------------------------------------------------------

    def test_state_read_via_tools_call_happy_path(self) -> None:
        fixture = {
            "task_id": "T1",
            "plan_id": "P1",
            "phase": "planning",
            "status": "active",
            "acceptance_criteria": [],
            "failure_log": [],
            "history": [],
        }
        state_dir = self._workspace / ".cursor" / "state"
        state_dir.mkdir(parents=True, exist_ok=True)
        (state_dir / "workflow-state.json").write_text(
            json.dumps(fixture), encoding="utf-8"
        )

        resp = self._bridge.send(
            {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "tools/call",
                "params": {"name": "state_read", "arguments": {}},
            }
        )
        result = resp.get("result", {})
        content = result.get("content", [])
        self.assertTrue(len(content) > 0, f"empty content in response: {resp}")
        text = content[0].get("text", "")
        parsed = json.loads(text)
        self.assertEqual(parsed, fixture, f"state_read returned unexpected data: {parsed}")

    # ------------------------------------------------------------------
    # 6. unimplemented tool -> -32601
    # ------------------------------------------------------------------

    def test_unimplemented_tool_returns_minus_32601(self) -> None:
        # Phase 2 promoted state_init / state_set_phase / state_record_failure
        # to functional handlers.  state_history_append and
        # state_update_acceptance_criterion remain Phase 3 placeholders.
        resp = self._bridge.send(
            {
                "jsonrpc": "2.0",
                "id": 6,
                "method": "tools/call",
                "params": {"name": "state_history_append", "arguments": {"task_id": "T", "event": "x"}},
            }
        )
        error = resp.get("error", {})
        self.assertEqual(
            error.get("code"),
            -32601,
            f"expected error code -32601 for Phase-3 placeholder tool, got: {resp}",
        )


if __name__ == "__main__":
    unittest.main()
