#!/usr/bin/env python3
"""Compatibility shim for the workflow-state API and CLI.

The canonical implementation lives under
``src/oh_my_cursor/workflow_state/``. This checked-in shim remains so older
installed plugin payloads and direct developer commands keep working while
``.cursor/state/`` stays the schema/runtime contract surface.
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

_SRC_DIR = Path(__file__).resolve().parents[2] / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

_api = importlib.import_module("oh_my_cursor.workflow_state.api")
_cli = importlib.import_module("oh_my_cursor.workflow_state.cli")

AC_STATUSES = getattr(_api, "AC_STATUSES")
DEFAULT_HISTORY_CAP = getattr(_api, "DEFAULT_HISTORY_CAP")
FAILURE_TYPES = getattr(_api, "FAILURE_TYPES")
PHASES = getattr(_api, "PHASES")
ROLES = getattr(_api, "ROLES")
STATUSES = getattr(_api, "STATUSES")
append_history = getattr(_api, "append_history")
build_parser = getattr(_cli, "build_parser")
file_lock = getattr(_api, "file_lock")
init_state = getattr(_api, "init_state")
main = getattr(_cli, "main")
read_state = getattr(_api, "read_state")
record_failure = getattr(_api, "record_failure")
set_state = getattr(_api, "set_state")
update_acceptance_criterion = getattr(_api, "update_acceptance_criterion")

__all__ = [
    "AC_STATUSES",
    "DEFAULT_HISTORY_CAP",
    "FAILURE_TYPES",
    "PHASES",
    "ROLES",
    "STATUSES",
    "append_history",
    "build_parser",
    "file_lock",
    "init_state",
    "main",
    "read_state",
    "record_failure",
    "set_state",
    "update_acceptance_criterion",
]


if __name__ == "__main__":
    raise SystemExit(main())
