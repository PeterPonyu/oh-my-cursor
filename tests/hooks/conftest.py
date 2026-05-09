"""Shared fixtures for hook tests."""

from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def repo_root() -> Path:
    """Return the absolute repository root."""
    return Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def hooks_dir(repo_root: Path) -> Path:
    """Return the hooks/ directory path."""
    path = repo_root / "hooks"
    if not path.is_dir():
        pytest.fail(f"hooks directory missing: {path}")
    return path


@pytest.fixture(scope="session")
def hook_scripts(hooks_dir: Path) -> list[Path]:
    """Return all .py files in hooks/, sorted by name."""
    scripts = sorted(hooks_dir.glob("*.py"))
    if not scripts:
        pytest.fail(f"no .py files found in {hooks_dir}")
    return scripts


@pytest.fixture(scope="session")
def workflow_state_paths() -> list[str]:
    """Return the canonical state paths to protect from direct writes."""
    return [
        ".cursor/state/workflow-state.json",
        ".cursor/state/workflow-state.example.json",
        ".cursor/state/workflow-state.schema.json",
        "docs/plans/",
    ]
