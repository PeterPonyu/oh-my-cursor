"""POSIX advisory file lock for shared workflow-state writes.

This module is the canonical implementation for workflow-state write
serialisation. Compatibility shims may re-export :func:`file_lock`, but no
other package should carry a second lock implementation.
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

    The lock is held on a sibling ``<target>.lock`` file so an atomic
    write-then-rename of the data file does not invalidate the lock holder.
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
