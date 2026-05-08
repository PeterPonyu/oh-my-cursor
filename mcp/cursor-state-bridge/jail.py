"""Jail-root path containment helper for cursor-state-bridge.

Three allowed jail roots:
  1. <workspace>/.cursor/state/
  2. <workspace>/docs/plans/
  3. <workspace>/.omcs/cursor-state-bridge/
"""
from __future__ import annotations

import os
from pathlib import Path


class JailError(Exception):
    """Raised when a resolved path escapes all three jail roots."""


def jail_roots(workspace: Path) -> list[Path]:
    """Return the three absolute jail roots for the given workspace."""
    return [
        workspace / ".cursor" / "state",
        workspace / "docs" / "plans",
        workspace / ".omcs" / "cursor-state-bridge",
    ]


def resolve_jailed(workspace: Path, target: Path) -> Path:
    """Resolve *target* to its realpath and assert it is under one of the three jail roots.

    Parameters
    ----------
    workspace:
        Absolute path to the workspace root.
    target:
        Path to validate (may be relative or contain symlinks).

    Returns
    -------
    Path
        The resolved absolute path.

    Raises
    ------
    JailError
        If the resolved path is not under any of the three jail roots.
    """
    resolved = Path(os.path.realpath(target))
    roots = jail_roots(workspace)
    for root in roots:
        real_root = Path(os.path.realpath(root))
        try:
            resolved.relative_to(real_root)
            return resolved
        except ValueError:
            continue
    raise JailError(f"jail-escape: {target} not under any allowed root")
