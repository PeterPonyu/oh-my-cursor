"""Direct unit tests for ``mcp/cursor-state-bridge/jail.py``.

Subprocess-based smoke coverage of jail-escape paths lives in
``test_state_io_read.py``; these tests exercise ``resolve_jailed`` and
``jail_roots`` directly so a regression in the helper surfaces without
needing to spawn the full bridge.
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, ClassVar


BRIDGE_DIR = Path(__file__).resolve().parents[1]
JAIL_PATH = BRIDGE_DIR / "jail.py"


def _load_jail():
    if str(BRIDGE_DIR) not in sys.path:
        sys.path.insert(0, str(BRIDGE_DIR))
    spec = importlib.util.spec_from_file_location("_omcs_jail_test", str(JAIL_PATH))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load jail module: {JAIL_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["_omcs_jail_test"] = module
    spec.loader.exec_module(module)
    return module


class TestJail(unittest.TestCase):

    jail: ClassVar[Any]

    @classmethod
    def setUpClass(cls) -> None:
        cls.jail = _load_jail()

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.workspace = Path(self._tmp.name)
        (self.workspace / ".cursor" / "state").mkdir(parents=True)
        (self.workspace / "docs" / "plans" / "T-001").mkdir(parents=True)
        (self.workspace / ".omcs" / "cursor-state-bridge").mkdir(parents=True)

    def test_three_jail_roots_advertised(self) -> None:
        roots = self.jail.jail_roots(self.workspace)
        self.assertEqual(len(roots), 3)
        suffixes = [str(r).rsplit(str(self.workspace), 1)[-1] for r in roots]
        self.assertTrue(any(".cursor/state" in s for s in suffixes))
        self.assertTrue(any("docs/plans" in s for s in suffixes))
        self.assertTrue(any(".omcs/cursor-state-bridge" in s for s in suffixes))

    def test_state_path_resolves_inside_jail(self) -> None:
        target = self.workspace / ".cursor" / "state" / "workflow-state.json"
        resolved = self.jail.resolve_jailed(self.workspace, target)
        self.assertTrue(str(resolved).startswith(str(self.workspace.resolve())))

    def test_per_task_path_resolves_inside_jail(self) -> None:
        target = self.workspace / "docs" / "plans" / "T-001" / "workflow-state.json"
        resolved = self.jail.resolve_jailed(self.workspace, target)
        self.assertIn("T-001", str(resolved))

    def test_path_outside_jail_raises(self) -> None:
        with self.assertRaises(self.jail.JailError):
            self.jail.resolve_jailed(self.workspace, Path("/etc/passwd"))

    def test_traversal_via_dotdot_raises(self) -> None:
        target = self.workspace / "docs" / "plans" / ".." / ".." / ".." / "etc" / "passwd"
        with self.assertRaises(self.jail.JailError):
            self.jail.resolve_jailed(self.workspace, target)


if __name__ == "__main__":
    unittest.main()
