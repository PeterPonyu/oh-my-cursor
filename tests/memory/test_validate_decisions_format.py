"""Pytest coverage for scripts/validate-decisions-format.py."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "validate-decisions-format.py"
TEMPLATE = Path(__file__).resolve().parents[2] / "docs" / "templates" / "decision.md"


CLEAN = (
    "---\n"
    "id: 20260520-example\n"
    "title: Example\n"
    "status: accepted\n"
    "date: 2026-05-20\n"
    'supersedes: ""\n'
    'superseded_by: ""\n'
    "tags: []\n"
    "---\n\n"
    "# 20260520-example\n\n"
    "## Context\nContext.\n\n"
    "## Decision\nDecision.\n\n"
    "## Consequences\nConsequences.\n\n"
    "## Evidence\nEvidence.\n"
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
    assert "VALIDATE_DECISIONS_FORMAT_SELF_TEST_OK" in result.stdout


def test_shipped_template_passes() -> None:
    result = _run(TEMPLATE)
    assert result.returncode == 0, result.stderr


def test_clean_fixture_passes(tmp_path: Path) -> None:
    d = tmp_path / "20260520-example.md"
    d.write_text(CLEAN, encoding="utf-8")
    assert _run(d).returncode == 0


def test_bad_filename_fails(tmp_path: Path) -> None:
    d = tmp_path / "no-date-prefix.md"
    d.write_text(CLEAN, encoding="utf-8")
    result = _run(d)
    assert result.returncode == 1
    assert "filename must be YYYYMMDD" in result.stderr


def test_id_mismatch_fails(tmp_path: Path) -> None:
    d = tmp_path / "20260520-other.md"
    d.write_text(CLEAN, encoding="utf-8")
    result = _run(d)
    assert result.returncode == 1
    assert "does not match filename id" in result.stderr


def test_bad_status_fails(tmp_path: Path) -> None:
    d = tmp_path / "20260520-example.md"
    d.write_text(CLEAN.replace("status: accepted", "status: maybe"), encoding="utf-8")
    result = _run(d)
    assert result.returncode == 1
    assert "status='maybe'" in result.stderr or "status=\"maybe\"" in result.stderr


def test_superseded_requires_superseded_by(tmp_path: Path) -> None:
    d = tmp_path / "20260520-example.md"
    d.write_text(CLEAN.replace("status: accepted", "status: superseded"), encoding="utf-8")
    result = _run(d)
    assert result.returncode == 1
    assert "superseded_by is empty" in result.stderr


def test_missing_heading_fails(tmp_path: Path) -> None:
    d = tmp_path / "20260520-example.md"
    d.write_text(CLEAN.replace("## Evidence", "## Other"), encoding="utf-8")
    result = _run(d)
    assert result.returncode == 1
    assert "missing required heading: ## Evidence" in result.stderr


def test_directory_mode_validates_all(tmp_path: Path) -> None:
    decisions = tmp_path / "decisions"
    decisions.mkdir()
    (decisions / "20260520-a.md").write_text(
        CLEAN.replace("20260520-example", "20260520-a"), encoding="utf-8"
    )
    (decisions / "20260521-b.md").write_text(
        CLEAN.replace("20260520-example", "20260521-b").replace("2026-05-20", "2026-05-21"),
        encoding="utf-8",
    )
    result = _run(decisions)
    assert result.returncode == 0
    assert "validated 2 decision file(s)" in result.stdout
