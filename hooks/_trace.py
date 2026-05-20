"""Optional opt-in tracing helper for oh-my-cursor hook scripts.

Activated by setting `OH_MY_CURSOR_HOOK_TRACE=1` in the environment. Each
call to :func:`trace` appends one JSON line to the trace file. The default
path is `<repo-root>/.omcs/hook-trace.log`, but it can be overridden with
`OH_MY_CURSOR_HOOK_TRACE_FILE`. The directory is created on demand.

Failures inside the tracer are swallowed so they never alter hook output.
The helper itself is read-only with respect to workflow state.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from _repo import resolve_repo_root


_TRUE = {"1", "true", "TRUE", "yes", "on"}


def _enabled() -> bool:
    return os.environ.get("OH_MY_CURSOR_HOOK_TRACE", "") in _TRUE


def _resolve_log_path() -> Path:
    override = os.environ.get("OH_MY_CURSOR_HOOK_TRACE_FILE", "").strip()
    if override:
        return Path(override).expanduser()
    repo_root = resolve_repo_root(__file__)
    return repo_root / ".omcs" / "hook-trace.log"


def trace(record: dict) -> None:
    if not _enabled():
        return
    try:
        target = _resolve_log_path()
        target.parent.mkdir(parents=True, exist_ok=True)
        full = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "pid": os.getpid(),
            **record,
        }
        with open(target, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(full, ensure_ascii=False) + "\n")
    except Exception:
        return
