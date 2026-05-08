"""Jail-root containment and state_read negative-case tests for cursor-state-bridge.

Covers:
  - state_read on missing file -> "no state"
  - state_read with workspace jail-escape argument -> -32602
  - state_read with task_id path traversal -> -32602
  - state_read with valid task_id sub-path -> success
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

    def close(self) -> None:
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=2)
        except Exception:
            self.proc.kill()
            self.proc.wait(timeout=2)


@unittest.skipUnless(BRIDGE_AVAILABLE, "bridge core not yet on disk (Track A in progress)")
class TestStateIORead(unittest.TestCase):

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._workspace = Path(self._tmpdir.name)
        self._bridge = BridgeProcess(self._workspace)

    def tearDown(self) -> None:
        self._bridge.close()
        self._tmpdir.cleanup()

    # ------------------------------------------------------------------
    # 1. Missing file -> "no state"
    # ------------------------------------------------------------------

    def test_state_read_missing_file_returns_no_state(self) -> None:
        """Empty workspace: state_read must return 'no state' (no crash)."""
        resp = self._bridge.send(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "state_read", "arguments": {}},
            }
        )
        result = resp.get("result", {})
        content = result.get("content", [])
        self.assertTrue(len(content) > 0, f"expected content, got: {resp}")
        text = content[0].get("text", "")
        self.assertEqual(text, "no state", f"expected 'no state', got: {text!r}")

    # ------------------------------------------------------------------
    # 2. Workspace argument + task_id jail-escape -> -32602
    # ------------------------------------------------------------------

    def test_state_read_jail_escape_via_workspace_arg(self) -> None:
        """task_id traversal that escapes the argument workspace jail must be rejected with -32602.

        The server accepts an optional 'workspace' argument.  When it does, the jail
        roots are derived from that workspace.  Providing task_id='../../etc/passwd'
        causes the resolved target path to escape all three jail roots of the
        supplied workspace, triggering -32602.  This validates that the jail check
        operates on the resolved path regardless of which workspace is used.
        """
        resp = self._bridge.send(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "state_read",
                    "arguments": {
                        "workspace": "/tmp",
                        "task_id": "../../etc/passwd",
                    },
                },
            }
        )
        error = resp.get("error", {})
        self.assertEqual(
            error.get("code"),
            -32602,
            f"expected -32602 for workspace+task_id jail-escape, got: {resp}",
        )
        msg = error.get("message", "")
        self.assertTrue(
            msg.startswith("jail-escape:"),
            f"error message must start with 'jail-escape:', got: {msg!r}",
        )

    # ------------------------------------------------------------------
    # 3. task_id path traversal -> -32602
    # ------------------------------------------------------------------

    def test_state_read_task_id_jail_escape(self) -> None:
        """task_id='../../etc' must resolve outside jail and be rejected with -32602."""
        resp = self._bridge.send(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "state_read",
                    "arguments": {"task_id": "../../etc"},
                },
            }
        )
        error = resp.get("error", {})
        self.assertEqual(
            error.get("code"),
            -32602,
            f"expected -32602 for task_id traversal, got: {resp}",
        )
        msg = error.get("message", "")
        self.assertTrue(
            msg.startswith("jail-escape:"),
            f"error message must start with 'jail-escape:', got: {msg!r}",
        )

    # ------------------------------------------------------------------
    # 4. Valid task_id sub-path -> success
    # ------------------------------------------------------------------

    def test_state_read_task_id_path_works(self) -> None:
        """task_id='T1' must read <workspace>/docs/plans/T1/workflow-state.json."""
        fixture = {
            "task_id": "T1",
            "plan_id": "P1",
            "phase": "execution",
            "status": "active",
            "acceptance_criteria": [],
            "failure_log": [],
            "history": [],
        }
        plan_dir = self._workspace / "docs" / "plans" / "T1"
        plan_dir.mkdir(parents=True, exist_ok=True)
        (plan_dir / "workflow-state.json").write_text(
            json.dumps(fixture), encoding="utf-8"
        )

        resp = self._bridge.send(
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {
                    "name": "state_read",
                    "arguments": {"task_id": "T1"},
                },
            }
        )
        result = resp.get("result", {})
        content = result.get("content", [])
        self.assertTrue(len(content) > 0, f"expected content, got: {resp}")
        text = content[0].get("text", "")
        parsed = json.loads(text)
        self.assertEqual(
            parsed,
            fixture,
            f"state_read(task_id='T1') returned unexpected data: {parsed}",
        )


if __name__ == "__main__":
    unittest.main()
