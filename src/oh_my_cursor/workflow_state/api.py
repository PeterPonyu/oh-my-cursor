"""Workflow-state document API.

The on-disk schema stays at ``.cursor/state/workflow-state.schema.json``.
This module owns the executable read/write logic and is imported by the CLI,
compatibility shims, hooks, and the MCP bridge.
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import date
from pathlib import Path
from typing import Any, NoReturn

from .locking import file_lock


# ---------------------------------------------------------------------------
# Schema enums (keep in sync with workflow-state.schema.json)
# ---------------------------------------------------------------------------

# Default cap for history[] FIFO eviction (Phase 7).  cap=0 disables
# compaction; negative values are normalised to 0 so a misconfigured caller
# never surfaces a runtime error from the retention path.
DEFAULT_HISTORY_CAP = 1000

PHASES = {"intake", "research", "plan", "execute", "verify", "review", "done", "blocked"}
STATUSES = {"pending", "in_progress", "passed", "failed", "blocked"}
ROLES = {
    "",
    "architect",
    "code-reviewer",
    "critic",
    "debugger",
    "explore",
    "implementer",
    "orchestrator",
    "planner",
    "qa-tester",
    "researcher",
    "security-reviewer",
    "test-engineer",
    "tracer",
    "verifier",
}
AC_STATUSES = {"pending", "passed", "failed", "skipped"}
FAILURE_TYPES = {
    "",
    "transient",
    "fixable",
    "needs_replan",
    "escalate",
    "flaky",
    "regression",
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _fail(message: str) -> NoReturn:
    raise SystemExit(f"FAIL: {message}")


def _load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        _fail(f"state file does not exist: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        _fail(f"state file is not valid JSON: {exc}")
    if not isinstance(value, dict):
        _fail("state root must be a JSON object")
    return value


def _atomic_write_state(path: Path, state: dict[str, Any]) -> None:
    """Write ``state`` to ``path`` atomically.

    Writes to a unique sibling temp file then ``os.replace``s into place so
    a concurrent reader never observes a partial document.  The temp filename
    is created with ``O_EXCL`` by :func:`tempfile.mkstemp`, so a pre-created
    workspace symlink cannot redirect the sidecar write outside the state
    directory.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    legacy_tmp_path = path.with_suffix(path.suffix + ".tmp")
    if legacy_tmp_path.is_symlink():
        raise OSError(f"unsafe workflow-state temp symlink: {legacy_tmp_path}")
    data = json.dumps(state, indent=2, ensure_ascii=False) + "\n"
    fd = -1
    tmp_name = ""
    try:
        fd, tmp_name = tempfile.mkstemp(
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=str(path.parent),
            text=True,
        )
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            fd = -1
            handle.write(data)
        Path(tmp_name).replace(path)
    finally:
        if fd >= 0:
            os.close(fd)
        if tmp_name:
            try:
                Path(tmp_name).unlink()
            except FileNotFoundError:
                pass


def _push_history(state: dict[str, Any], note: str, *, phase: str | None = None,
                  status: str | None = None) -> None:
    """Append a single history entry in-place on the supplied state dict.

    Always uses the *current* top-level ``phase``/``status`` unless explicit
    overrides are supplied.  Callers that need to record the *new* values
    after mutating the top-level fields should pass them explicitly.
    """
    history = state.setdefault("history", [])
    if isinstance(history, list):
        history.append({
            "phase": phase if phase is not None else str(state.get("phase", "")),
            "status": status if status is not None else str(state.get("status", "")),
            "note": note,
            "at": date.today().isoformat(),
        })


def _compact_history(state: dict[str, Any], cap: int = DEFAULT_HISTORY_CAP) -> None:
    """FIFO-evict ``history[]`` so its length never exceeds ``cap``.

    ``cap <= 0`` disables compaction entirely (sentinel for opt-out).  The
    function mutates ``state["history"]`` in place and is intended to be
    called after :func:`_push_history` and before :func:`_atomic_write_state`,
    so each write has a single bounded history when it lands on disk.

    Compaction preserves the most-recent ``cap`` entries; the eviction is
    FIFO — the oldest entries are dropped first — so the surviving slice
    keeps timestamps monotonic non-decreasing whenever the input was.
    """
    if not isinstance(cap, int) or cap <= 0:
        return
    history = state.get("history")
    if not isinstance(history, list):
        return
    if len(history) <= cap:
        return
    # Slice off the oldest entries; keep the trailing window of size cap.
    state["history"] = history[-cap:]


# ---------------------------------------------------------------------------
# Public library API
# ---------------------------------------------------------------------------


def read_state(path: Path) -> dict[str, Any] | None:
    """Return the parsed state document, or ``None`` if the file is missing."""
    path = Path(path)
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"state file is not valid JSON: {exc}") from exc


def init_state(
    path: Path,
    *,
    task_id: str,
    title: str = "",
    phase: str = "intake",
    status: str = "pending",
    role: str = "orchestrator",
    next_action: str = "",
    history_cap: int = DEFAULT_HISTORY_CAP,
) -> dict[str, Any]:
    """Create a new workflow-state file.

    Validates phase/status/role against the schema enums and writes the
    resulting document atomically under :func:`file_lock`.  Returns the
    written state.
    """
    path = Path(path)
    if path.exists():
        raise FileExistsError(f"workflow-state already exists at {path}; use set_state() to mutate, or remove the file first")
    if phase not in PHASES:
        _fail(f"phase must be one of {sorted(PHASES)}")
    if status not in STATUSES:
        _fail(f"status must be one of {sorted(STATUSES)}")
    if role not in ROLES:
        _fail(f"role must be one of {sorted(ROLES)}")

    state: dict[str, Any] = {
        "task_id": task_id,
        "title": title or task_id,
        "phase": phase,
        "status": status,
        "current_role": role,
        "next_action": next_action or "define acceptance criteria and route to orchestrator",
        "acceptance_criteria": [],
        "failure": {"type": "", "message": "", "retry_count": 0},
        "history": [],
    }
    _push_history(state, "initialized workflow state")
    _compact_history(state, history_cap)
    with file_lock(path):
        _atomic_write_state(path, state)
    return state


def set_state(
    path: Path,
    *,
    phase: str | None = None,
    status: str | None = None,
    role: str | None = None,
    next_action: str | None = None,
    note: str = "updated workflow state",
    history_cap: int = DEFAULT_HISTORY_CAP,
) -> dict[str, Any]:
    """Update phase / status / role / next_action; append history entry."""
    path = Path(path)
    if phase is not None and phase not in PHASES:
        _fail(f"phase must be one of {sorted(PHASES)}")
    if status is not None and status not in STATUSES:
        _fail(f"status must be one of {sorted(STATUSES)}")
    if role is not None and role not in ROLES:
        _fail(f"role must be one of {sorted(ROLES)}")
    with file_lock(path):
        state = _load_state(path)
        if phase is not None:
            state["phase"] = phase
        if status is not None:
            state["status"] = status
        if role is not None:
            state["current_role"] = role
        if next_action is not None:
            state["next_action"] = next_action
        _push_history(state, note)
        _compact_history(state, history_cap)
        _atomic_write_state(path, state)
    return state


def update_acceptance_criterion(
    path: Path,
    *,
    ac_id: str,
    status: str,
    criterion: str | None = None,
    evidence: str | None = None,
    note: str = "",
    history_cap: int = DEFAULT_HISTORY_CAP,
) -> dict[str, Any]:
    """Add or update an acceptance criterion.

    ``evidence`` is OPTIONAL per the schema and is only written when
    explicitly supplied; absent ``evidence`` keeps the existing value (or
    the empty string for newly created entries).
    """
    path = Path(path)
    if status not in AC_STATUSES:
        _fail(f"acceptance criterion status must be one of {sorted(AC_STATUSES)}")
    with file_lock(path):
        state = _load_state(path)
        criteria = state.setdefault("acceptance_criteria", [])
        if not isinstance(criteria, list):
            _fail("acceptance_criteria must be a list")

        target: dict[str, Any] | None = None
        for item in criteria:
            if isinstance(item, dict) and item.get("id") == ac_id:
                target = item
                break
        if target is None:
            criteria.append({
                "id": ac_id,
                "criterion": criterion or ac_id,
                "status": status,
                "evidence": evidence or "",
            })
        else:
            if criterion is not None:
                target["criterion"] = criterion
            target["status"] = status
            if evidence is not None:
                target["evidence"] = evidence
        _push_history(state, note or f"updated acceptance criterion {ac_id}")
        _compact_history(state, history_cap)
        _atomic_write_state(path, state)
    return state


def record_failure(
    path: Path,
    *,
    type: str = "fixable",
    message: str = "",
    retry_count: int = 0,
    note: str = "",
    history_cap: int = DEFAULT_HISTORY_CAP,
) -> dict[str, Any]:
    """Record failure metadata; status flips to ``failed`` when ``type`` is set."""
    path = Path(path)
    if type not in FAILURE_TYPES:
        _fail(f"failure type must be one of {sorted(FAILURE_TYPES)}")
    if retry_count < 0 or retry_count > 3:
        _fail("retry-count must be between 0 and 3")
    with file_lock(path):
        state = _load_state(path)
        state["status"] = "failed" if type else state.get("status", "failed")
        state["failure"] = {"type": type, "message": message, "retry_count": retry_count}
        _push_history(state, note or f"recorded failure type {type}")
        _compact_history(state, history_cap)
        _atomic_write_state(path, state)
    return state


def append_history(
    path: Path,
    *,
    note: str,
    phase: str | None = None,
    status: str | None = None,
    history_cap: int = DEFAULT_HISTORY_CAP,
) -> dict[str, Any]:
    """Append a free-form history entry without mutating top-level fields."""
    path = Path(path)
    with file_lock(path):
        state = _load_state(path)
        _push_history(state, note, phase=phase, status=status)
        _compact_history(state, history_cap)
        _atomic_write_state(path, state)
    return state
