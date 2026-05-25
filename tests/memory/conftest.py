"""Shared pytest fixtures for tests/memory.

Mirrors tests/hooks/conftest.py: adds the repo root and the scripts
directory to sys.path so test modules can import the validators by name
(``import validate_notepad_format`` etc.) without manipulating sys.path
inside every test file.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"


def _ensure_on_path(path: Path) -> None:
    p = str(path)
    if p not in sys.path:
        sys.path.insert(0, p)


_ensure_on_path(ROOT)
_ensure_on_path(SCRIPTS)


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return ROOT


@pytest.fixture(scope="session")
def scripts_dir() -> Path:
    return SCRIPTS
