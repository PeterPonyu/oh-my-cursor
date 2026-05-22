"""Security regressions for workflow-state temp sidecar files.

The MCP bridge validates the final workflow-state path before writing, but the
packaged writer also touches sibling temp files. These tests ensure a
workspace-controlled symlink at the legacy deterministic temp path cannot
redirect writes outside the validated state directory.
"""
from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SRC_DIR = REPO_ROOT / "src"
LIB_AVAILABLE = (SRC_DIR / "oh_my_cursor" / "workflow_state" / "api.py").is_file()
POSIX_ONLY = os.name == "posix"


def _load_api():
    if str(SRC_DIR) not in sys.path:
        sys.path.insert(0, str(SRC_DIR))
    return importlib.import_module("oh_my_cursor.workflow_state.api")


@unittest.skipUnless(LIB_AVAILABLE and POSIX_ONLY, "POSIX-only symlink sidecar tests")
class TestSidecarSymlinkSecurity(unittest.TestCase):

    def test_state_write_rejects_tmp_symlink_escape(self) -> None:
        api = _load_api()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            state_path = root / "workspace" / "docs" / "plans" / "T" / "workflow-state.json"
            state_path.parent.mkdir(parents=True)
            outside = root / "outside.txt"
            outside.write_text("outside-safe", encoding="utf-8")
            tmp_path = state_path.with_suffix(state_path.suffix + ".tmp")
            tmp_path.symlink_to(outside)

            with self.assertRaises(OSError):
                api.init_state(state_path, task_id="T")

            self.assertEqual(outside.read_text(encoding="utf-8"), "outside-safe")
            self.assertFalse(state_path.exists(), "state path must not become the attacker symlink")


if __name__ == "__main__":
    unittest.main()
