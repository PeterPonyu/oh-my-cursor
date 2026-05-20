"""Shared repository-root resolution for OMCS hooks.

Hooks may run from the source checkout, from a copied local plugin, or with a
workspace environment override. The repo/plugin root is the directory that owns
the checked-in OMCS payload, not the parent of `hooks/`.
"""
from __future__ import annotations

import os
from pathlib import Path


def _is_repo_root(path: Path) -> bool:
    return (
        (path / "hooks" / "hooks.json").is_file()
        and (path / "agents").is_dir()
        and (path / "skills").is_dir()
        and (path / ".cursor-plugin" / "plugin.json").is_file()
    )


def resolve_repo_root(anchor: str | Path) -> Path:
    """Return the OMCS payload root for a hook module."""
    for raw in (
        os.environ.get("OH_MY_CURSOR_WORKSPACE", ""),
        os.getcwd(),
    ):
        if not raw:
            continue
        candidate = Path(raw).expanduser().resolve()
        if _is_repo_root(candidate):
            return candidate

    current = Path(anchor).resolve()
    for candidate in (current.parent, *current.parents):
        if _is_repo_root(candidate):
            return candidate
    return current.parents[1]


def resolve_workspace_root(anchor: str | Path) -> Path:
    """Return the active workspace root used for runtime state files."""
    for raw in (
        os.environ.get("OH_MY_CURSOR_WORKSPACE", ""),
        os.getcwd(),
    ):
        if not raw:
            continue
        candidate = Path(raw).expanduser().resolve()
        if "plugins/local/oh-my-cursor" not in candidate.as_posix():
            return candidate
    return resolve_repo_root(anchor)
