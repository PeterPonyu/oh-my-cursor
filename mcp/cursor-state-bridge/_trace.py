"""Structured trace lane for cursor-state-bridge JSON-RPC calls.

Each call appends one JSON line to ``<workspace>/.omcs/cursor-state-bridge/trace.jsonl``
(V3 path -- distinct from ``.omcs/hook-trace.log``, which is owned by the
hook trace helper at ``.cursor/hooks/_trace.py``).

Rotation policy: 10 MiB cap with FIFO eviction.  When a write would push
the file past the cap, the oldest half of the file is dropped before the
write proceeds.

The trace is opt-out via ``OH_MY_CURSOR_MCP_TRACE=0`` and opt-in via the
default (any other value, or unset, leaves tracing enabled at the
runtime level).  Failures inside the tracer are swallowed so they never
alter bridge output.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_DISABLED = {"0", "false", "FALSE", "no", "off"}
TRACE_FILENAME = "trace.jsonl"
ROTATION_CAP_BYTES = 10 * 1024 * 1024  # 10 MiB


def _enabled() -> bool:
    return os.environ.get("OH_MY_CURSOR_MCP_TRACE", "1") not in _DISABLED


def _resolve_trace_path(workspace: Path) -> Path:
    override = os.environ.get("OH_MY_CURSOR_MCP_TRACE_FILE", "").strip()
    if override:
        return Path(override).expanduser()
    return workspace / ".omcs" / "cursor-state-bridge" / TRACE_FILENAME


def _rotate_if_needed(path: Path) -> None:
    """FIFO eviction when the file exceeds the 10 MiB cap."""
    try:
        size = path.stat().st_size
    except OSError:
        return
    if size <= ROTATION_CAP_BYTES:
        return
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    if not lines:
        return
    # Drop the oldest half; keep the most recent half.
    keep = lines[len(lines) // 2:]
    body = "\n".join(keep) + ("\n" if keep else "")
    try:
        path.write_text(body, encoding="utf-8")
    except OSError:
        return


def trace(workspace: Path, record: dict[str, Any]) -> None:
    """Append one JSON line to the bridge trace file (best-effort)."""
    if not _enabled():
        return
    try:
        path = _resolve_trace_path(Path(workspace))
        path.parent.mkdir(parents=True, exist_ok=True)
        _rotate_if_needed(path)
        full = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "pid": os.getpid(),
            **record,
        }
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(full, ensure_ascii=False) + "\n")
    except Exception:
        return
