"""Pytest coverage for scripts/validate-project-memory.py."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "validate-project-memory.py"
TEMPLATE = Path(__file__).resolve().parents[2] / "docs" / "templates" / "project-memory.json"


CLEAN: dict = {
    "version": 1,
    "task": "",
    "techStack": {"languages": ["python"], "frameworks": [], "tooling": ["pytest"]},
    "build": {"install": "", "test": "pytest", "lint": "", "typecheck": ""},
    "conventions": {"indent": "4 spaces", "filenameCase": "snake_case", "moduleLayout": ""},
    "structure": {"src": "src/", "tests": "tests/", "docs": "docs/"},
    "userOwned": {"customNotes": ["note one"], "directives": ["never push to main"]},
    "hotPaths": ["scripts/validate-workflow-state.py"],
}


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
    assert "VALIDATE_PROJECT_MEMORY_SELF_TEST_OK" in result.stdout


def test_shipped_template_passes() -> None:
    result = _run(TEMPLATE)
    assert result.returncode == 0, result.stderr


def test_clean_fixture_passes(tmp_path: Path) -> None:
    pm = tmp_path / "pm.json"
    pm.write_text(json.dumps(CLEAN), encoding="utf-8")
    assert _run(pm).returncode == 0


def test_bad_version_fails(tmp_path: Path) -> None:
    pm = tmp_path / "pm.json"
    bad = json.loads(json.dumps(CLEAN))
    bad["version"] = 2
    pm.write_text(json.dumps(bad), encoding="utf-8")
    result = _run(pm)
    assert result.returncode == 1
    assert "version must be the integer 1" in result.stderr


def test_missing_userowned_fails(tmp_path: Path) -> None:
    pm = tmp_path / "pm.json"
    bad = json.loads(json.dumps(CLEAN))
    del bad["userOwned"]
    pm.write_text(json.dumps(bad), encoding="utf-8")
    result = _run(pm)
    assert result.returncode == 1
    assert "missing required key: userOwned" in result.stderr


def test_userowned_array_shape_enforced(tmp_path: Path) -> None:
    pm = tmp_path / "pm.json"
    bad = json.loads(json.dumps(CLEAN))
    bad["userOwned"]["directives"] = "never push"  # string instead of array
    pm.write_text(json.dumps(bad), encoding="utf-8")
    result = _run(pm)
    assert result.returncode == 1
    assert "userOwned.directives must be an array" in result.stderr


def test_extra_top_key_fails(tmp_path: Path) -> None:
    pm = tmp_path / "pm.json"
    bad = json.loads(json.dumps(CLEAN))
    bad["surprise"] = "nope"
    pm.write_text(json.dumps(bad), encoding="utf-8")
    result = _run(pm)
    assert result.returncode == 1
    assert "unsupported fields" in result.stderr
