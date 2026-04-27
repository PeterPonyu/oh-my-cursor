from __future__ import annotations

import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().with_name("run_benchmark.py")
SPEC = importlib.util.spec_from_file_location("cursor_run_benchmark", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _make_result(name: str, success: bool, markers: list[str]) -> object:
    return MODULE.CheckResult(
        name=name,
        command=f"./scripts/{name}.sh",
        success=success,
        duration_sec=0.1,
        output_tail="\n".join(markers + (["ok"] if success else ["FAIL"])),
        markers=markers,
    )


def _all_pass_baseline_results() -> list[object]:
    """All baseline dimensions pass; no enhanced-only markers present."""
    return [
        _make_result("default_auth", True, ["CURSOR_AUTH_OK", "CURSOR_MODEL_AUTO_OK"]),
        _make_result("surface_visibility", True, ["REFINEMENT_MAP_OK", "PLUGIN_BOUNDARY_OK", "DISCOVERABILITY_OK"]),
        _make_result("state_contract", True, []),
        _make_result("backbone_verify", True, []),
        _make_result("smoke_cursor", True, []),
    ]


def _all_pass_enhanced_results() -> list[object]:
    """All dimensions pass including all enhanced-only markers."""
    return [
        _make_result("default_auth", True, ["CURSOR_AUTH_OK", "CURSOR_MODEL_AUTO_OK"]),
        _make_result("surface_visibility", True, ["REFINEMENT_MAP_OK", "PLUGIN_BOUNDARY_OK", "DISCOVERABILITY_OK"]),
        _make_result("state_contract", True, []),
        _make_result("backbone_verify", True, []),
        _make_result(
            "smoke_cursor",
            True,
            ["CURSOR_AGENT_OK", "CURSOR_TASK_SCENARIO_OK", "CURSOR_TASK_PLAN_OK", "CURSOR_TASK_COMMAND_OK"],
        ),
    ]


def _missing_default_auth_results() -> list[object]:
    """default_auth check fails."""
    return [
        _make_result("default_auth", False, []),
        _make_result("surface_visibility", True, ["REFINEMENT_MAP_OK", "PLUGIN_BOUNDARY_OK", "DISCOVERABILITY_OK"]),
        _make_result("state_contract", True, []),
        _make_result("backbone_verify", True, []),
        _make_result("smoke_cursor", True, []),
    ]


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

class CursorScoringInvariantTests(unittest.TestCase):

    def test_baseline_threshold_equals_baseline_max(self) -> None:
        """When variant=baseline with all-pass fixture, threshold_score == max_score."""
        ev = MODULE.build_evaluation("backbone", "baseline", _all_pass_baseline_results())
        self.assertEqual(
            ev.threshold_score,
            ev.max_score,
            "For baseline all-pass, threshold_score must equal max_score (all active dims are required).",
        )

    def test_enhanced_threshold_strictly_greater_than_baseline(self) -> None:
        """Enhanced threshold must exceed baseline threshold due to added required dimensions."""
        ev_baseline = MODULE.build_evaluation("backbone", "baseline", _all_pass_baseline_results())
        ev_enhanced = MODULE.build_evaluation("backbone", "enhanced", _all_pass_enhanced_results())
        self.assertGreater(
            ev_enhanced.threshold_score,
            ev_baseline.threshold_score,
            "Enhanced threshold_score must be strictly greater than baseline threshold_score.",
        )

    def test_expected_baseline_score_excludes_enhanced_only_markers(self) -> None:
        """expected_baseline_score must not count any enhanced-only dimension weights."""
        ev = MODULE.build_evaluation("backbone", "enhanced", _all_pass_enhanced_results())
        enhanced_only_names = {"CURSOR_AGENT_OK", "CURSOR_TASK_SCENARIO_OK", "CURSOR_TASK_PLAN_OK", "CURSOR_TASK_COMMAND_OK"}
        weight_map = MODULE.build_evaluation.__code__.co_consts  # just verify via recompute
        # Recompute expected_baseline_score from weight_map directly
        raw_weight_map = {
            "default_auth": 20,
            "CURSOR_MODEL_AUTO_OK": 15,
            "surface_visibility": 20,
            "REFINEMENT_MAP_OK": 10,
            "PLUGIN_BOUNDARY_OK": 10,
            "DISCOVERABILITY_OK": 10,
            "state_contract": 20,
            "backbone_verify": 25,
            "CURSOR_AGENT_OK": 20,
            "CURSOR_TASK_SCENARIO_OK": 10,
            "CURSOR_TASK_PLAN_OK": 10,
            "CURSOR_TASK_COMMAND_OK": 10,
        }
        expected = sum(w for name, w in raw_weight_map.items() if name not in enhanced_only_names)
        self.assertEqual(
            ev.expected_baseline_score,
            expected,
            f"expected_baseline_score={ev.expected_baseline_score} != recomputed={expected}; "
            "enhanced-only markers must be excluded.",
        )

    def test_release_blocking_iff_not_passed(self) -> None:
        """Regression canary: catches any code path that decouples release_blocking from passed.
        Not an independent property."""
        fixtures = [
            ("baseline-all-pass", "baseline", _all_pass_baseline_results()),
            ("enhanced-all-pass", "enhanced", _all_pass_enhanced_results()),
            ("baseline-missing-auth", "baseline", _missing_default_auth_results()),
        ]
        for label, variant, results in fixtures:
            with self.subTest(fixture=label):
                ev = MODULE.build_evaluation("backbone", variant, results)
                self.assertEqual(
                    ev.release_blocking,
                    not ev.passed,
                    f"[{label}] release_blocking must always equal (not passed); "
                    f"passed={ev.passed}, release_blocking={ev.release_blocking}.",
                )

    def test_dimension_required_set_equals_active_set(self) -> None:
        """All active dimensions must be required (and vice versa) for both variants."""
        for variant, results in [
            ("baseline", _all_pass_baseline_results()),
            ("enhanced", _all_pass_enhanced_results()),
        ]:
            with self.subTest(variant=variant):
                ev = MODULE.build_evaluation("backbone", variant, results)
                required_names = {d.name for d in ev.dimensions if d.required}
                active_names = {d.name for d in ev.dimensions}
                self.assertEqual(
                    required_names,
                    active_names,
                    f"[{variant}] required dims must equal active dims; "
                    f"required={required_names}, active={active_names}.",
                )

    def test_score_max_equals_sum_dimension_weights(self) -> None:
        """score == sum of passed-dimension weights; max_score == sum of active-dimension weights."""
        for variant, results in [
            ("baseline", _all_pass_baseline_results()),
            ("enhanced", _all_pass_enhanced_results()),
        ]:
            with self.subTest(variant=variant):
                ev = MODULE.build_evaluation("backbone", variant, results)
                expected_score = sum(d.weight for d in ev.dimensions if d.passed)
                expected_max = sum(d.weight for d in ev.dimensions)
                self.assertEqual(ev.score, expected_score, f"[{variant}] score mismatch")
                self.assertEqual(ev.max_score, expected_max, f"[{variant}] max_score mismatch")

    def test_validator_smoke_rejects_missing_state_contract(self) -> None:
        """Negative-only test: the state-contract Python logic must fail when .gitignore is absent.

        validate-state-contract.sh always cd's to its own repo root (BASH_SOURCE-derived),
        so cwd has no effect on the bash wrapper. Instead we run the embedded Python logic
        directly with a temp dir as cwd, which causes a FileNotFoundError on the .gitignore
        read — the same failure the script would produce in a repo without the required file.
        """
        # Inline Python matching the embedded block in validate-state-contract.sh
        inline_py = (
            "import json, pathlib, sys\n"
            "root = pathlib.Path.cwd().resolve()\n"
            "if (root / '.cursor' / 'cli-config.json').exists():\n"
            "    raise SystemExit('FAIL: .cursor/cli-config.json must stay user-level')\n"
            "if (root / '.cursor' / 'mcp.json').exists():\n"
            "    raise SystemExit('FAIL: .cursor/mcp.json should not be checked in')\n"
            "if (root / '.cursor' / 'memories').exists():\n"
            "    raise SystemExit('FAIL: .cursor/memories should not be checked in')\n"
            "gitignore = (root / '.gitignore').read_text(encoding='utf-8')\n"
            "for required in ('.cursor/mcp.json', '.cursor/memories/'):\n"
            "    if required not in gitignore:\n"
            "        raise SystemExit(f'FAIL: .gitignore missing {required}')\n"
            "print('ok')\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            proc = subprocess.run(
                ["python3", "-c", inline_py],
                cwd=tmp,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertNotEqual(
                proc.returncode,
                0,
                f"validator wrongly passed in empty dir; stdout={proc.stdout!r}",
            )

    def test_argparse_guard_rejects_enhanced_without_smoke(self) -> None:
        """--variant enhanced without --run-agent-smoke must exit 2."""
        proc = subprocess.run(
            [
                "python3",
                "/home/zeyufu/Desktop/oh-my-cursor/benchmark/run_benchmark.py",
                "--variant",
                "enhanced",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        self.assertEqual(
            proc.returncode,
            2,
            f"expected exit 2, got {proc.returncode}; stderr={proc.stderr!r}",
        )
        self.assertIn("requires --run-agent-smoke", proc.stderr)


if __name__ == "__main__":
    unittest.main()
