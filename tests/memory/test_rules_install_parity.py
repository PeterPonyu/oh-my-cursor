"""Smoke-wrap scripts/validate-rules-install-parity.sh in pytest so the
parity check runs alongside the rest of the memory test suite.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "validate-rules-install-parity.sh"


@pytest.mark.skipif(shutil.which("rsync") is None, reason="rsync not installed")
def test_rules_install_parity() -> None:
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    assert "VALIDATE_RULES_INSTALL_PARITY_OK" in result.stdout
