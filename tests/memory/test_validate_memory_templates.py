"""Pytest coverage for scripts/validate-memory-templates.py."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "validate-memory-templates.py"


def test_meta_self_test_passes() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--self-test"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "VALIDATE_MEMORY_TEMPLATES_SELF_TEST_OK" in result.stdout


def test_meta_run_passes() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "VALIDATE_MEMORY_TEMPLATES_OK" in result.stdout
