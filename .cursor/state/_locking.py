"""POSIX advisory file lock for shared workflow-state writes.

This is the single source of truth for write serialisation. Both the CLI
shim at `.cursor/state/workflow-state.py` and the MCP bridge under
`mcp/cursor-state-bridge/state_io.py` import this module so that
concurrent writers against the same workflow-state document never
interleave.

POSIX-only (uses :mod:`fcntl`). A cross-platform replacement is tracked
as F2 in the consensus plan.

The lock is taken on a sibling `<path>.lock` file so that an atomic
write-then-rename of the data file does not invalidate the lock holder
of an in-flight writer.
"""
from __future__ import annotations

import fcntl
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


@contextmanager
def file_lock(target: Path) -> Iterator[None]:
    """Acquire an exclusive advisory lock for the lifetime of the ``with`` block.

    Parameters
    ----------
    target:
        Path to the data file being protected.  The lock is held on a
        sibling ``<target>.lock`` file.
    """
    target = Path(target)
    lock_path = Path(str(target) + ".lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(lock_path), os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)
