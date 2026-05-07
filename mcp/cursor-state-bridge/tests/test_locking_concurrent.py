"""Concurrency proof for the shared file_lock (AC-208).

Spawns two subprocess writers calling ``set_state`` simultaneously
against the same workflow-state.json.  Asserts both writes are
recorded, ``history[]`` is monotonic, and no entries are lost or
interleaved.

POSIX-only (the lock primitive uses :mod:`fcntl`).  Cross-platform
support is tracked as F2.
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
STATE_DIR = REPO_ROOT / ".cursor" / "state"
LIB_PATH = STATE_DIR / "workflow-state.py"
LIB_AVAILABLE = LIB_PATH.is_file() and (STATE_DIR / "_locking.py").is_file()
POSIX_ONLY = os.name == "posix"


def _load_library():
    if str(STATE_DIR) not in sys.path:
        sys.path.insert(0, str(STATE_DIR))
    spec = importlib.util.spec_from_file_location("_omcs_wfs_concurrency", str(LIB_PATH))
    module = importlib.util.module_from_spec(spec)
    sys.modules["_omcs_wfs_concurrency"] = module
    spec.loader.exec_module(module)
    return module


@unittest.skipUnless(LIB_AVAILABLE and POSIX_ONLY, "POSIX-only concurrency test")
class TestLockingConcurrent(unittest.TestCase):

    def test_two_writers_serialise_no_lost_writes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "workflow-state.json"
            lib = _load_library()
            lib.init_state(path, task_id="T-conc")

            writer_script = textwrap.dedent(
                f"""
                import sys
                sys.path.insert(0, {str(STATE_DIR)!r})
                import importlib.util
                spec = importlib.util.spec_from_file_location("worker_lib", {str(LIB_PATH)!r})
                m = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(m)
                tag = sys.argv[1]
                for i in range(5):
                    m.set_state({str(path)!r}, status="in_progress", note=f"writer-{{tag}}-iter-{{i}}")
                """
            )

            procs = [
                subprocess.Popen(
                    [sys.executable, "-c", writer_script, tag],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                )
                for tag in ("A", "B")
            ]
            for proc in procs:
                stdout, stderr = proc.communicate(timeout=15)
                self.assertEqual(proc.returncode, 0, msg=stderr.decode("utf-8", "replace"))

            final = lib.read_state(path)
            history = final["history"]
            # 1 (init) + 5 from A + 5 from B = 11 entries minimum.
            self.assertGreaterEqual(len(history), 11)

            # Both writers' tags must appear; no lost writes.
            notes = [h.get("note", "") for h in history]
            self.assertGreaterEqual(sum(1 for n in notes if "writer-A" in n), 5)
            self.assertGreaterEqual(sum(1 for n in notes if "writer-B" in n), 5)

            # Per-tag relative ordering: iter-0 < iter-1 < iter-2 ... within each tag.
            for tag in ("A", "B"):
                idxs = [
                    int(n.rsplit("-iter-", 1)[1])
                    for n in notes
                    if f"writer-{tag}-iter-" in n
                ]
                self.assertEqual(idxs, sorted(idxs), msg=f"writer {tag} writes were re-ordered: {idxs}")

            # ISO date column must be present and monotonic non-decreasing.
            ats = [h.get("at", "") for h in history]
            self.assertEqual(ats, sorted(ats), msg="history timestamps not monotonic")


if __name__ == "__main__":
    unittest.main()
