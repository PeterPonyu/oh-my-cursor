from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().with_name("run_benchmark.py")
SPEC = importlib.util.spec_from_file_location("cursor_run_benchmark", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CursorHistoryCleanupTests(unittest.TestCase):
    def test_collapse_history_entries_keeps_latest_equivalent_rerun(self) -> None:
        entries = [
            {
                "timestamp": "2026-04-21T14:40:58Z",
                "repo": "oh-my-cursor",
                "git_branch": "main",
                "git_sha": "97e68fc",
                "profile": "backbone",
                "variant": "baseline",
                "score": 100,
                "max_score": 120,
                "threshold_score": 100,
                "passed": True,
                "release_blocking": False,
                "output_dir": "benchmark/results/current-baseline",
            },
            {
                "timestamp": "2026-04-21T14:41:00Z",
                "repo": "oh-my-cursor",
                "git_branch": "main",
                "git_sha": "97e68fc",
                "profile": "backbone",
                "variant": "baseline",
                "score": 100,
                "max_score": 120,
                "threshold_score": 100,
                "passed": True,
                "release_blocking": False,
                "output_dir": "benchmark/results/current-baseline",
            },
            {
                "timestamp": "2026-04-21T14:41:32Z",
                "repo": "oh-my-cursor",
                "git_branch": "main",
                "git_sha": "97e68fc",
                "profile": "backbone",
                "variant": "enhanced",
                "score": 120,
                "max_score": 120,
                "threshold_score": 120,
                "passed": True,
                "release_blocking": False,
                "output_dir": "benchmark/results/current-enhanced",
            },
        ]

        collapsed = MODULE.collapse_history_entries(entries)

        self.assertEqual(len(collapsed), 2)
        self.assertEqual(collapsed[0]["variant"], "enhanced")
        self.assertEqual(collapsed[1]["timestamp"], "2026-04-21T14:41:00Z")

    def test_render_history_markdown_includes_only_collapsed_rows(self) -> None:
        entries = MODULE.collapse_history_entries(
            [
                {
                    "timestamp": "2026-04-21T14:41:32Z",
                    "repo": "oh-my-cursor",
                    "git_branch": "main",
                    "git_sha": "97e68fc",
                    "profile": "backbone",
                    "variant": "enhanced",
                    "score": 120,
                    "max_score": 120,
                    "threshold_score": 120,
                    "passed": True,
                    "release_blocking": False,
                    "output_dir": "benchmark/results/current-enhanced",
                },
                {
                    "timestamp": "2026-04-21T14:41:38Z",
                    "repo": "oh-my-cursor",
                    "git_branch": "main",
                    "git_sha": "97e68fc",
                    "profile": "backbone",
                    "variant": "enhanced",
                    "score": 120,
                    "max_score": 120,
                    "threshold_score": 120,
                    "passed": True,
                    "release_blocking": False,
                    "output_dir": "benchmark/results/current-enhanced",
                },
            ]
        )

        markdown = MODULE.render_history_markdown(entries)

        self.assertIn("# Cursor Benchmark History", markdown)
        self.assertIn("`2026-04-21T14:41:38Z`", markdown)
        self.assertNotIn("`2026-04-21T14:41:32Z`", markdown)


if __name__ == "__main__":
    unittest.main()
