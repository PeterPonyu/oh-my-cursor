"""Phase 7 tests: bounded ``history[]`` retention with FIFO eviction.

Covers AC-701..AC-705:
  AC-701: a synthetic state with 1500 entries gets compacted to 1000
          after the next write.
  AC-702: FIFO eviction -- the oldest entries are dropped first; the
          surviving slice is the most-recent ``cap`` entries.
  AC-703: post-compaction ``history[].at`` remains monotonic
          non-decreasing (validate-workflow-state --check-history-cap
          confirms this).
  AC-704: ``cap=0`` opts out of compaction (sentinel for retention
          disabled).
  AC-705: the most-recent entry is preserved verbatim (the new entry
          appended by ``set_state`` is the last item in the surviving
          window).
"""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
STATE_DIR = REPO_ROOT / ".cursor" / "state"
LIB_PATH = STATE_DIR / "workflow-state.py"
LIB_AVAILABLE = LIB_PATH.is_file() and (STATE_DIR / "_locking.py").is_file()


def _load_library():
    if str(STATE_DIR) not in sys.path:
        sys.path.insert(0, str(STATE_DIR))
    spec = importlib.util.spec_from_file_location("_omcs_wfs_compaction", str(LIB_PATH))
    module = importlib.util.module_from_spec(spec)
    sys.modules["_omcs_wfs_compaction"] = module
    spec.loader.exec_module(module)
    return module


def _seed_synthetic_history(path: Path, library, count: int) -> None:
    """Initialise a workflow-state file then back-fill ``history[]`` to ``count`` entries."""
    library.init_state(path, task_id="T-comp")
    state = library.read_state(path)
    # The init call already produced one history entry.  Pad with
    # synthetic entries that have monotonic ISO dates so AC-703 holds.
    seeded: list[dict] = state["history"][:]
    while len(seeded) < count:
        seeded.append({
            "phase": "intake",
            "status": "pending",
            "note": f"seeded-{len(seeded)}",
            "at": f"2026-01-{(len(seeded) % 28) + 1:02d}",
        })
    seeded.sort(key=lambda h: h.get("at", ""))
    state["history"] = seeded
    # Bypass the public API for the seed step so we control the on-disk
    # shape exactly; the next call goes through the library and exercises
    # the real compaction path.
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


@unittest.skipUnless(LIB_AVAILABLE, "workflow-state library not on disk")
class TestHistoryCompaction(unittest.TestCase):

    @classmethod
    def setUpClass(cls) -> None:
        cls.lib = _load_library()

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = Path(self._tmp.name) / "workflow-state.json"

    # --------------------------------------------------------------
    # AC-701: 1500 -> 1000 after the next write
    # --------------------------------------------------------------

    def test_compacts_1500_to_default_cap(self) -> None:
        _seed_synthetic_history(self.path, self.lib, count=1500)
        before = self.lib.read_state(self.path)
        self.assertEqual(len(before["history"]), 1500)

        # Default cap=1000; the new write appends one entry then compacts.
        state = self.lib.set_state(self.path, status="in_progress", note="compaction trigger")
        self.assertLessEqual(len(state["history"]), 1000)
        self.assertEqual(len(state["history"]), 1000)

    # --------------------------------------------------------------
    # AC-702: FIFO eviction (oldest dropped first)
    # --------------------------------------------------------------

    def test_fifo_eviction_drops_oldest(self) -> None:
        _seed_synthetic_history(self.path, self.lib, count=1500)
        before = self.lib.read_state(self.path)
        before_history = before["history"][:]

        state = self.lib.set_state(self.path, status="in_progress", note="fifo-trigger")
        kept = state["history"]
        # The new history is the trailing 1000 of (1500 + 1 newly-appended) = 1501.
        # That means the first 501 entries of the original window were evicted.
        # The first surviving entry should be the entry at index 501 of the
        # PRE-write history (since we appended one entry, dropped the oldest 501).
        expected_first_surviving = before_history[501]
        self.assertEqual(kept[0]["note"], expected_first_surviving["note"])
        self.assertEqual(kept[0]["at"], expected_first_surviving["at"])

    # --------------------------------------------------------------
    # AC-703: post-compaction timestamps monotonic
    # --------------------------------------------------------------

    def test_post_compaction_timestamps_monotonic(self) -> None:
        _seed_synthetic_history(self.path, self.lib, count=1500)
        state = self.lib.set_state(self.path, status="in_progress", note="monotonic-check")
        ats = [h.get("at", "") for h in state["history"]]
        self.assertEqual(ats, sorted(ats), "history[].at must remain monotonic post-compaction")

    # --------------------------------------------------------------
    # AC-704: cap=0 disables compaction (opt-out sentinel)
    # --------------------------------------------------------------

    def test_cap_zero_disables_compaction(self) -> None:
        _seed_synthetic_history(self.path, self.lib, count=1500)
        state = self.lib.set_state(self.path, status="in_progress", note="opt-out", history_cap=0)
        # 1500 seeded + 1 appended by set_state, no compaction.
        self.assertEqual(len(state["history"]), 1501)

    # --------------------------------------------------------------
    # AC-705: the most-recent entry is preserved verbatim
    # --------------------------------------------------------------

    def test_most_recent_entry_preserved(self) -> None:
        _seed_synthetic_history(self.path, self.lib, count=1500)
        state = self.lib.set_state(
            self.path, status="in_progress", note="ralph-most-recent-marker"
        )
        last = state["history"][-1]
        self.assertEqual(last["note"], "ralph-most-recent-marker")
        self.assertEqual(last["status"], "in_progress")

    # --------------------------------------------------------------
    # Negative cap normalised to opt-out (defensive)
    # --------------------------------------------------------------

    def test_negative_cap_treated_as_optout(self) -> None:
        _seed_synthetic_history(self.path, self.lib, count=1500)
        state = self.lib.set_state(
            self.path, status="in_progress", note="negative-cap", history_cap=-5
        )
        self.assertEqual(len(state["history"]), 1501)


if __name__ == "__main__":
    unittest.main()
