#!/usr/bin/env python3
"""Repository wrapper for the shipped workflow-state CLI."""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

_SRC_DIR = Path(__file__).resolve().parents[1] / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

_cli = importlib.import_module("oh_my_cursor.workflow_state.cli")
main = getattr(_cli, "main")


if __name__ == "__main__":
    raise SystemExit(main())
