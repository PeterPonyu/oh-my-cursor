"""Pytest coverage for scripts/validate-notepad-format.py.

We invoke the script as a subprocess so the test exercises the same
entry path a maintainer or CI step would use, and we keep the test free
of import-name issues that come from script files with hyphens.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "validate-notepad-format.py"
TEMPLATE = Path(__file__).resolve().parents[2] / "docs" / "templates" / "notepad.md"


CLEAN = (
    "# notepad\n\n"
    "## Priority Context\n\n"
    "<!-- OMCS:NOTEPAD:PRIORITY -->\n"
    "Short and sweet.\n"
    "<!-- /OMCS:NOTEPAD:PRIORITY -->\n\n"
    "## Working Memory\n\n"
    "<!-- OMCS:NOTEPAD:WORKING -->\n"
    "2026-05-20T15:00:00Z first\n"
    "2026-05-20T16:00:00Z second\n"
    "<!-- /OMCS:NOTEPAD:WORKING -->\n\n"
    "## MANUAL\n\n"
    "<!-- OMCS:NOTEPAD:MANUAL -->\n"
    "Hand-curated invariant.\n"
    "<!-- /OMCS:NOTEPAD:MANUAL -->\n"
)


def _run(arg: str | Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(arg)],
        capture_output=True,
        text=True,
    )


def test_self_test_passes() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--self-test"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "VALIDATE_NOTEPAD_FORMAT_SELF_TEST_OK" in result.stdout


def test_shipped_template_passes() -> None:
    result = _run(TEMPLATE)
    assert result.returncode == 0, result.stderr
    assert "VALIDATE_NOTEPAD_FORMAT_OK" in result.stdout


def test_clean_fixture_passes(tmp_path: Path) -> None:
    nb = tmp_path / "notepad.md"
    nb.write_text(CLEAN, encoding="utf-8")
    result = _run(nb)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    "replacement,expected_substr",
    [
        ("## Priority Context", "missing required header"),
        ("<!-- OMCS:NOTEPAD:PRIORITY -->", "missing start marker"),
        ("<!-- /OMCS:NOTEPAD:PRIORITY -->", "missing end marker"),
    ],
)
def test_missing_markers_fail(tmp_path: Path, replacement: str, expected_substr: str) -> None:
    nb = tmp_path / "notepad.md"
    nb.write_text(CLEAN.replace(replacement, ""), encoding="utf-8")
    result = _run(nb)
    assert result.returncode == 1
    assert expected_substr in result.stderr


def test_oversized_priority_fails(tmp_path: Path) -> None:
    nb = tmp_path / "notepad.md"
    nb.write_text(CLEAN.replace("Short and sweet.", "x" * 600), encoding="utf-8")
    result = _run(nb)
    assert result.returncode == 1
    assert "Priority Context exceeds" in result.stderr


def test_nonmonotonic_working_fails(tmp_path: Path) -> None:
    nb = tmp_path / "notepad.md"
    swapped = CLEAN.replace(
        "2026-05-20T15:00:00Z first\n2026-05-20T16:00:00Z second",
        "2026-05-20T16:00:00Z second\n2026-05-20T15:00:00Z first",
    )
    nb.write_text(swapped, encoding="utf-8")
    result = _run(nb)
    assert result.returncode == 1
    assert "not sorted non-decreasing" in result.stderr


def test_untimestamped_working_fails(tmp_path: Path) -> None:
    nb = tmp_path / "notepad.md"
    nb.write_text(
        CLEAN.replace(
            "2026-05-20T15:00:00Z first",
            "first (no timestamp)",
        ),
        encoding="utf-8",
    )
    result = _run(nb)
    assert result.returncode == 1
    assert "does not start with an ISO 8601" in result.stderr
