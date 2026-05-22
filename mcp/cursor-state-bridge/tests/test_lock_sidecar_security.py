"""Security regressions for workflow-state lock sidecars."""
from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SRC_DIR = REPO_ROOT / "src"
LIB_AVAILABLE = (SRC_DIR / "oh_my_cursor" / "workflow_state" / "locking.py").is_file()
POSIX_ONLY = os.name == "posix"


def _load_locking():
    if str(SRC_DIR) not in sys.path:
        sys.path.insert(0, str(SRC_DIR))
    return importlib.import_module("oh_my_cursor.workflow_state.locking")


@unittest.skipUnless(LIB_AVAILABLE and POSIX_ONLY, "POSIX-only lock sidecar tests")
class TestLockSidecarSecurity(unittest.TestCase):

    def test_file_lock_rejects_lock_symlink_escape(self) -> None:
        locking = _load_locking()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            state_path = root / "workspace" / "docs" / "plans" / "T" / "workflow-state.json"
            state_path.parent.mkdir(parents=True)
            outside = root / "outside.lock"
            outside.write_text("outside-lock", encoding="utf-8")
            lock_path = Path(str(state_path) + ".lock")
            lock_path.symlink_to(outside)

            with self.assertRaises(OSError):
                with locking.file_lock(state_path):
                    pass

            self.assertEqual(outside.read_text(encoding="utf-8"), "outside-lock")


if __name__ == "__main__":
    unittest.main()
