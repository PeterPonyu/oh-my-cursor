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

    def test_build_evaluation_flags_non_improving_enhanced_run_for_investigation(self) -> None:
        results = [
            MODULE.CheckResult(
                name="default_auth",
                command="./scripts/check-default-auth.sh",
                success=True,
                duration_sec=0.1,
                output_tail="CURSOR_AUTH_OK\nCURSOR_MODEL_AUTO_OK\nok: auth available",
                markers=["CURSOR_AUTH_OK", "CURSOR_MODEL_AUTO_OK"],
            ),
            MODULE.CheckResult(
                name="surface_visibility",
                command="./scripts/validate-surface-visibility.sh",
                success=True,
                duration_sec=0.1,
                output_tail="REFINEMENT_MAP_OK\nPLUGIN_BOUNDARY_OK\nDISCOVERABILITY_OK\nok: surface visibility validation complete",
                markers=["REFINEMENT_MAP_OK", "PLUGIN_BOUNDARY_OK", "DISCOVERABILITY_OK"],
            ),
            MODULE.CheckResult(
                name="state_contract",
                command="./scripts/validate-state-contract.sh",
                success=True,
                duration_sec=0.1,
                output_tail="ok: state contract validation complete",
                markers=[],
            ),
            MODULE.CheckResult(
                name="backbone_verify",
                command="./scripts/verify-backbone.sh",
                success=True,
                duration_sec=0.1,
                output_tail="ok: backbone verification complete",
                markers=[],
            ),
            MODULE.CheckResult(
                name="smoke_cursor",
                command="./scripts/smoke-cursor-agent.sh",
                success=True,
                duration_sec=0.1,
                output_tail="ok: Cursor CLI smoke validation complete",
                markers=[],
            ),
        ]

        evaluation = MODULE.build_evaluation("backbone", "enhanced", results)

        self.assertFalse(evaluation.passed)
        self.assertEqual(evaluation.actual_delta_vs_baseline, 0)
        self.assertTrue(evaluation.investigation_required)
        self.assertIn("did not improve over the baseline floor", evaluation.improvement_summary)

    def test_build_evaluation_reports_positive_enhanced_uplift(self) -> None:
        results = [
            MODULE.CheckResult(
                name="default_auth",
                command="./scripts/check-default-auth.sh",
                success=True,
                duration_sec=0.1,
                output_tail="CURSOR_AUTH_OK\nCURSOR_MODEL_AUTO_OK\nok: auth available",
                markers=["CURSOR_AUTH_OK", "CURSOR_MODEL_AUTO_OK"],
            ),
            MODULE.CheckResult(
                name="surface_visibility",
                command="./scripts/validate-surface-visibility.sh",
                success=True,
                duration_sec=0.1,
                output_tail="REFINEMENT_MAP_OK\nPLUGIN_BOUNDARY_OK\nDISCOVERABILITY_OK\nok: surface visibility validation complete",
                markers=["REFINEMENT_MAP_OK", "PLUGIN_BOUNDARY_OK", "DISCOVERABILITY_OK"],
            ),
            MODULE.CheckResult(
                name="state_contract",
                command="./scripts/validate-state-contract.sh",
                success=True,
                duration_sec=0.1,
                output_tail="ok: state contract validation complete",
                markers=[],
            ),
            MODULE.CheckResult(
                name="backbone_verify",
                command="./scripts/verify-backbone.sh",
                success=True,
                duration_sec=0.1,
                output_tail="ok: backbone verification complete",
                markers=[],
            ),
            MODULE.CheckResult(
                name="smoke_cursor",
                command="./scripts/smoke-cursor-agent.sh",
                success=True,
                duration_sec=0.1,
                output_tail="CURSOR_AGENT_OK\nCURSOR_TASK_SCENARIO_OK docs/refinement-priority-map.md docs/plugin-boundary-review.md scripts/validate-benchmark-evidence.sh\nCURSOR_TASK_PLAN_OK scripts/validate-benchmark-evidence.sh unsupported-or-out-of-scope\nok: Cursor CLI smoke validation complete",
                markers=["CURSOR_AGENT_OK", "CURSOR_TASK_SCENARIO_OK", "CURSOR_TASK_PLAN_OK"],
            ),
        ]

        evaluation = MODULE.build_evaluation("backbone", "enhanced", results)

        self.assertTrue(evaluation.passed)
        self.assertEqual(evaluation.actual_delta_vs_baseline, 40)
        self.assertFalse(evaluation.investigation_required)
        self.assertIn("benchmark-backed uplift observed", evaluation.improvement_summary)


if __name__ == "__main__":
    unittest.main()
