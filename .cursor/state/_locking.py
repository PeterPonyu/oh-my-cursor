"""Compatibility shim for canonical workflow-state locking."""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

_SRC_DIR = Path(__file__).resolve().parents[2] / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

_locking = importlib.import_module("oh_my_cursor.workflow_state.locking")
file_lock = getattr(_locking, "file_lock")

__all__ = ["file_lock"]
