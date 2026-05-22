"""Library API tests for the packaged workflow-state implementation (AC-206).

Covers the six typed entrypoints introduced in Phase 2:
``init_state``, ``set_state``, ``update_acceptance_criterion``,
``record_failure``, ``append_history``, ``read_state``.

The test imports the packaged API directly and keeps one compatibility
check for the legacy `.cursor/state/workflow-state.py` shim. No
``argparse.Namespace`` mocks are used.
"""
from __future__ import annotations

import importlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, ClassVar


REPO_ROOT = Path(__file__).resolve().parents[3]
SRC_DIR = REPO_ROOT / "src"
LEGACY_LIB_PATH = REPO_ROOT / ".cursor" / "state" / "workflow-state.py"
LIB_PATH = SRC_DIR / "oh_my_cursor" / "workflow_state" / "api.py"
LIB_AVAILABLE = LIB_PATH.is_file()


def _load_library():
    """Import the packaged workflow-state API (no Namespace mocks)."""
    if str(SRC_DIR) not in sys.path:
        sys.path.insert(0, str(SRC_DIR))
    return importlib.import_module("oh_my_cursor.workflow_state.api")


def _load_legacy_shim():
    """Load the legacy workflow-state shim from its hyphenated file path."""
    spec = importlib.util.spec_from_file_location(
        "_legacy_workflow_state_shim", str(LEGACY_LIB_PATH)
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load legacy workflow-state shim: {LEGACY_LIB_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@unittest.skipUnless(LIB_AVAILABLE, "workflow-state library not on disk")
class TestLibraryAPI(unittest.TestCase):
    """Six entrypoints, six dedicated tests, zero argparse mocks."""

    lib: ClassVar[Any]

    @classmethod
    def setUpClass(cls) -> None:
        cls.lib = _load_library()

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = Path(self._tmp.name) / "workflow-state.json"

    def test_init_state_writes_schema_valid_document(self) -> None:
        state = self.lib.init_state(
            self.path,
            task_id="T-001",
            title="library api test",
            phase="intake",
            status="pending",
            role="orchestrator",
        )
        self.assertEqual(state["task_id"], "T-001")
        self.assertEqual(state["phase"], "intake")
        self.assertEqual(state["status"], "pending")
        self.assertEqual(state["acceptance_criteria"], [])
        self.assertGreaterEqual(len(state["history"]), 1)
        self.assertTrue(self.path.is_file())

    def test_set_state_advances_phase_and_appends_history(self) -> None:
        self.lib.init_state(self.path, task_id="T-002")
        before = self.lib.read_state(self.path)
        state = self.lib.set_state(self.path, phase="execute", status="in_progress", note="advance")
        self.assertEqual(state["phase"], "execute")
        self.assertEqual(state["status"], "in_progress")
        self.assertGreater(len(state["history"]), len(before["history"]))

    def test_update_acceptance_criterion_optional_evidence(self) -> None:
        self.lib.init_state(self.path, task_id="T-003")
        # Without evidence (schema permits absent evidence; new entry stores empty string).
        state = self.lib.update_acceptance_criterion(
            self.path, ac_id="AC-001", status="pending"
        )
        ac = state["acceptance_criteria"][0]
        self.assertEqual(ac["id"], "AC-001")
        self.assertEqual(ac["status"], "pending")
        self.assertEqual(ac["evidence"], "")

        # Update existing without supplying evidence -- existing value preserved.
        state = self.lib.update_acceptance_criterion(
            self.path, ac_id="AC-001", status="passed", evidence="scripts/foo.sh"
        )
        self.assertEqual(state["acceptance_criteria"][0]["status"], "passed")
        self.assertEqual(state["acceptance_criteria"][0]["evidence"], "scripts/foo.sh")

        state = self.lib.update_acceptance_criterion(
            self.path, ac_id="AC-001", status="passed"
        )
        self.assertEqual(state["acceptance_criteria"][0]["evidence"], "scripts/foo.sh")

    def test_record_failure_validates_retry_count(self) -> None:
        self.lib.init_state(self.path, task_id="T-004")
        state = self.lib.record_failure(
            self.path, type="fixable", message="boom", retry_count=2
        )
        self.assertEqual(state["failure"]["type"], "fixable")
        self.assertEqual(state["failure"]["retry_count"], 2)
        self.assertEqual(state["status"], "failed")

        # retry_count > 3 must raise SystemExit("FAIL: retry-count must be between 0 and 3")
        with self.assertRaises(SystemExit):
            self.lib.record_failure(self.path, type="fixable", retry_count=4)

    def test_append_history_does_not_mutate_top_level_fields(self) -> None:
        self.lib.init_state(self.path, task_id="T-005")
        before = self.lib.read_state(self.path)
        state = self.lib.append_history(self.path, note="standalone history note")
        # phase/status/role unchanged.
        self.assertEqual(state["phase"], before["phase"])
        self.assertEqual(state["status"], before["status"])
        self.assertEqual(state["current_role"], before["current_role"])
        # history grew by exactly 1.
        self.assertEqual(len(state["history"]), len(before["history"]) + 1)
        self.assertEqual(state["history"][-1]["note"], "standalone history note")

    def test_read_state_returns_none_for_missing_file(self) -> None:
        self.assertIsNone(self.lib.read_state(self.path))
        self.lib.init_state(self.path, task_id="T-006")
        loaded = self.lib.read_state(self.path)
        self.assertIsInstance(loaded, dict)
        self.assertEqual(loaded["task_id"], "T-006")

    def test_legacy_shim_reexports_package_api(self) -> None:
        shim = _load_legacy_shim()
        self.assertIs(shim.init_state, self.lib.init_state)
        self.assertIs(shim.set_state, self.lib.set_state)
        self.assertTrue(callable(shim.main))

    def test_legacy_cursor_state_shim_exports_packaged_api(self) -> None:
        self.assertTrue(LEGACY_LIB_PATH.is_file())
        shim_globals = {"__file__": str(LEGACY_LIB_PATH), "__name__": "_legacy_workflow_state_test"}
        exec(LEGACY_LIB_PATH.read_text(encoding="utf-8"), shim_globals)
        self.assertIs(shim_globals["init_state"], self.lib.init_state)
        self.assertIs(shim_globals["read_state"], self.lib.read_state)


if __name__ == "__main__":
    unittest.main()
