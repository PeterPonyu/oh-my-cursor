"""POSIX advisory file lock for shared workflow-state writes.

This module is the canonical implementation for workflow-state write
serialisation. Compatibility shims may re-export :func:`file_lock`, but no
other package should carry a second lock implementation.
"""
from __future__ import annotations

import fcntl
import os
import stat
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
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(str(lock_path), flags, 0o600)
    try:
        lock_stat = os.fstat(fd)
        if not stat.S_ISREG(lock_stat.st_mode):
            raise OSError(f"lock path is not a regular file: {lock_path}")
        if lock_stat.st_uid != os.getuid():
            raise OSError(f"lock path is not owned by the current user: {lock_path}")
        fcntl.flock(fd, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)
