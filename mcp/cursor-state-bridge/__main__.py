"""Entrypoint for cursor-state-bridge.

Usage:
    python3 mcp/cursor-state-bridge/__main__.py --workspace <path> [--task-id <id>]

Exits 0 on clean EOF, 1 on uncaught exception.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Ensure the package directory is on sys.path so that relative imports
# (jail, server) resolve correctly regardless of cwd.
_PKG_DIR = Path(__file__).resolve().parent
if str(_PKG_DIR) not in sys.path:
    sys.path.insert(0, str(_PKG_DIR))

from server import Server  # noqa: E402  (import after path manipulation)


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="cursor-state-bridge",
        description="Narrow stdio MCP server for .cursor/state/workflow-state.json.",
    )
    p.add_argument(
        "--workspace",
        required=True,
        metavar="PATH",
        help="Absolute path to the workspace root.",
    )
    p.add_argument(
        "--task-id",
        default="",
        metavar="ID",
        help="Optional task identifier; sets the default task for stateful tools.",
    )
    return p


def main() -> None:
    args = _build_parser().parse_args()
    server = Server(workspace=args.workspace, task_id=args.task_id)
    server.serve()


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"cursor-state-bridge: fatal: {exc}\n")
        sys.exit(1)
