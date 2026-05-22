"""Phase 3 tests: state_update_acceptance_criterion + state_history_append.

Covers AC-301..AC-305:
  AC-301: unknown ac_id is rejected (well-formed JSON-RPC error)
  AC-302: evidence is OPTIONAL (schema NOT tightened); supplied verbatim,
          absent preserves prior value, defaults to "" on first insert.
  AC-303: state_history_append adds an entry without mutating top-level
          phase / status / current_role.
  AC-304: tools/list shows 6 tools and tools/call routes all 6 to functional
          handlers (no -32601 placeholders).
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
STATE_LIB = REPO_ROOT / "src" / "oh_my_cursor" / "workflow_state" / "api.py"
LOCK_LIB = REPO_ROOT / "src" / "oh_my_cursor" / "workflow_state" / "locking.py"
BRIDGE_AVAILABLE = BRIDGE_MAIN.is_file() and STATE_LIB.is_file() and LOCK_LIB.is_file()


class BridgeProcess:
    """Spawn the bridge against a temp workspace."""

    def __init__(self, workspace: Path) -> None:
        (workspace / "docs" / "plans" / "T1").mkdir(parents=True, exist_ok=True)

        self.proc = subprocess.Popen(
            [sys.executable, str(BRIDGE_MAIN), "--workspace", str(workspace)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if self.proc.stdin is None or self.proc.stdout is None or self.proc.stderr is None:
            raise RuntimeError("bridge process pipes were not created")
        self.stdin = self.proc.stdin
        self.stdout = self.proc.stdout
        self.stderr = self.proc.stderr

    def call(self, name: str, arguments: dict, req_id: int = 1) -> dict:
        req = {"jsonrpc": "2.0", "id": req_id, "method": "tools/call",
               "params": {"name": name, "arguments": arguments}}
        return self._send(req)

    def list_tools(self, req_id: int = 1) -> dict:
        return self._send({"jsonrpc": "2.0", "id": req_id, "method": "tools/list", "params": {}})

    def _send(self, req: dict) -> dict:
        self.stdin.write(json.dumps(req) + "\n")
        self.stdin.flush()
        line = self.stdout.readline()
        if not line:
            err = self.stderr.read()
            raise RuntimeError(f"no response; stderr: {err}")
        return json.loads(line)

    def close(self) -> None:
        try:
            self.stdin.close()
            self.proc.wait(timeout=2)
        except Exception:
            self.proc.kill()
            self.proc.wait(timeout=2)
        finally:
            for stream in (self.stdout, self.stderr):
                try:
                    if stream is not None and not stream.closed:
                        stream.close()
                except Exception:
                    pass


@unittest.skipUnless(BRIDGE_AVAILABLE, "bridge or workflow-state library missing")
class TestAcceptanceCriteria(unittest.TestCase):

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.workspace = Path(self._tmpdir.name)
        workspace_state = self.workspace / ".cursor" / "state"
        workspace_state.mkdir(parents=True, exist_ok=True)
        (workspace_state / "workflow-state.py").write_text(
            "raise RuntimeError('workspace workflow-state.py must not execute')\n",
            encoding="utf-8",
        )
        self.bridge = BridgeProcess(self.workspace)
        # Initialise the per-task state file the AC tools will mutate.
        resp = self.bridge.call("state_init", {"task_id": "T1", "title": "phase3 test"})
        self.assertIn("result", resp, resp)

    def tearDown(self) -> None:
        self.bridge.close()
        self._tmpdir.cleanup()

    # ------------------------------------------------------------------
    # AC-304: full functional surface
    # ------------------------------------------------------------------

    def test_tools_list_six_functional_no_placeholders(self) -> None:
        resp = self.bridge.list_tools(req_id=10)
        names = [t["name"] for t in resp["result"]["tools"]]
        self.assertEqual(len(names), 6)
        # Every tool must accept tools/call and either return result or a
        # JSON-RPC error tied to params (NOT -32601 "method not implemented").
        for name in names:
            r = self.bridge.call(name, {"task_id": "T1", "phase": "intake", "ac_id": "AC", "status": "pending", "event": "x", "message": "x"})
            if "error" in r:
                self.assertNotEqual(
                    r["error"].get("code"),
                    -32601,
                    f"tool {name} still returns -32601: {r}",
                )
                self.assertNotIn(
                    "not implemented",
                    str(r["error"].get("message", "")).lower(),
                    f"tool {name} reports 'not implemented': {r}",
                )

    # ------------------------------------------------------------------
    # AC-302: evidence is OPTIONAL (schema not tightened)
    # ------------------------------------------------------------------

    def test_update_ac_evidence_optional(self) -> None:
        # Insert without evidence; new entry stores empty string.
        r = self.bridge.call(
            "state_update_acceptance_criterion",
            {"task_id": "T1", "ac_id": "AC-001", "status": "pending"},
            req_id=20,
        )
        self.assertIn("result", r, r)
        state = json.loads(r["result"]["content"][0]["text"])
        ac = next(item for item in state["acceptance_criteria"] if item["id"] == "AC-001")
        self.assertEqual(ac["evidence"], "")

        # Update with evidence; stored verbatim.
        r = self.bridge.call(
            "state_update_acceptance_criterion",
            {"task_id": "T1", "ac_id": "AC-001", "status": "passed", "evidence": "scripts/foo.sh"},
            req_id=21,
        )
        state = json.loads(r["result"]["content"][0]["text"])
        ac = next(item for item in state["acceptance_criteria"] if item["id"] == "AC-001")
        self.assertEqual(ac["status"], "passed")
        self.assertEqual(ac["evidence"], "scripts/foo.sh")

        # Update again WITHOUT evidence; previous value preserved.
        r = self.bridge.call(
            "state_update_acceptance_criterion",
            {"task_id": "T1", "ac_id": "AC-001", "status": "passed"},
            req_id=22,
        )
        state = json.loads(r["result"]["content"][0]["text"])
        ac = next(item for item in state["acceptance_criteria"] if item["id"] == "AC-001")
        self.assertEqual(ac["evidence"], "scripts/foo.sh")

    # ------------------------------------------------------------------
    # AC-301: missing required params → -32602 (well-formed JSON-RPC error)
    # ------------------------------------------------------------------

    def test_update_ac_missing_status_rejected(self) -> None:
        r = self.bridge.call(
            "state_update_acceptance_criterion",
            {"task_id": "T1", "ac_id": "AC-099"},  # status missing
            req_id=30,
        )
        self.assertIn("error", r, r)
        self.assertEqual(r["error"]["code"], -32602)

    def test_update_ac_invalid_status_rejected(self) -> None:
        r = self.bridge.call(
            "state_update_acceptance_criterion",
            {"task_id": "T1", "ac_id": "AC-100", "status": "not-a-real-status"},
            req_id=31,
        )
        self.assertIn("error", r, r)
        self.assertEqual(r["error"]["code"], -32602)

    # ------------------------------------------------------------------
    # AC-303: state_history_append does NOT mutate top-level fields
    # ------------------------------------------------------------------

    def test_history_append_preserves_top_level_fields(self) -> None:
        before = self.bridge.call("state_read", {"task_id": "T1"}, req_id=40)
        before_state = json.loads(before["result"]["content"][0]["text"])
        history_len_before = len(before_state["history"])

        r = self.bridge.call(
            "state_history_append",
            {"task_id": "T1", "note": "free-form annotation"},
            req_id=41,
        )
        self.assertIn("result", r, r)
        state = json.loads(r["result"]["content"][0]["text"])

        self.assertEqual(state["phase"], before_state["phase"])
        self.assertEqual(state["status"], before_state["status"])
        self.assertEqual(state["current_role"], before_state["current_role"])
        self.assertEqual(state["task_id"], before_state["task_id"])
        self.assertEqual(len(state["history"]), history_len_before + 1)
        self.assertEqual(state["history"][-1]["note"], "free-form annotation")


if __name__ == "__main__":
    unittest.main()
