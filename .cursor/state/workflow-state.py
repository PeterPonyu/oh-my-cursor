#!/usr/bin/env python3
"""Create or update an oh-my-cursor workflow-state JSON document.

This module is dual-purpose:

1. **Library API** (Phase 2). The functions :func:`init_state`,
   :func:`set_state`, :func:`update_acceptance_criterion`,
   :func:`record_failure`, :func:`append_history`, and :func:`read_state`
   are imported by both the CLI shim below and the MCP bridge's
   ``state_io.py``.  Each write function acquires the shared
   :func:`file_lock` from ``.cursor/state/_locking.py`` so concurrent
   writers serialise.

2. **CLI shim** (kept for developers and the minimal install payload).
   The ``init`` / ``set`` / ``ac`` / ``fail`` / ``history`` subcommands
   are thin wrappers over the library API.  Behaviour matches the
   original argparse contract.

The on-disk schema is defined by ``workflow-state.schema.json``.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

# Ensure the sibling ``_locking`` module is importable both when this file
# is invoked directly (``python3 .cursor/state/workflow-state.py ...``)
# and when it is loaded via :func:`importlib.util.spec_from_file_location`
# from the bridge.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))
from _locking import file_lock  # noqa: E402  (path-relative import by design)


# ---------------------------------------------------------------------------
# Schema enums (keep in sync with workflow-state.schema.json)
# ---------------------------------------------------------------------------

PHASES = {"intake", "research", "plan", "execute", "verify", "review", "done", "blocked"}
STATUSES = {"pending", "in_progress", "passed", "failed", "blocked"}
ROLES = {
    "",
    "orchestrator",
    "researcher",
    "planner",
    "implementer",
    "verifier",
    "critic",
    "debugger",
    "security-reviewer",
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


def _fail(message: str) -> None:
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

    Writes to a sibling ``<path>.tmp`` then ``os.replace``s into place so
    a concurrent reader never observes a partial document.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    tmp_path.replace(path)


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
) -> dict[str, Any]:
    """Create a new workflow-state file.

    Validates phase/status/role against the schema enums and writes the
    resulting document atomically under :func:`file_lock`.  Returns the
    written state.
    """
    path = Path(path)
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
        _atomic_write_state(path, state)
    return state


def record_failure(
    path: Path,
    *,
    type: str = "fixable",
    message: str = "",
    retry_count: int = 0,
    note: str = "",
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
        _atomic_write_state(path, state)
    return state


def append_history(
    path: Path,
    *,
    note: str,
    phase: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    """Append a free-form history entry without mutating top-level fields."""
    path = Path(path)
    with file_lock(path):
        state = _load_state(path)
        _push_history(state, note, phase=phase, status=status)
        _atomic_write_state(path, state)
    return state


# ---------------------------------------------------------------------------
# CLI shim — thin wrappers around the library API
# ---------------------------------------------------------------------------


def cmd_init(args: argparse.Namespace) -> None:
    init_state(
        args.path,
        task_id=args.task_id,
        title=args.title,
        phase=args.phase,
        status=args.status,
        role=args.role,
        next_action=args.next_action,
    )
    print(f"ok: wrote workflow state: {args.path}")


def cmd_set(args: argparse.Namespace) -> None:
    set_state(
        args.path,
        phase=args.phase,
        status=args.status,
        role=args.role if args.role is not None else None,
        next_action=args.next_action if args.next_action is not None else None,
        note=args.note or "updated workflow state",
    )
    print(f"ok: wrote workflow state: {args.path}")


def cmd_ac(args: argparse.Namespace) -> None:
    update_acceptance_criterion(
        args.path,
        ac_id=args.id,
        status=args.status,
        criterion=args.criterion,
        evidence=args.evidence,
        note=args.note,
    )
    print(f"ok: wrote workflow state: {args.path}")


def cmd_fail(args: argparse.Namespace) -> None:
    record_failure(
        args.path,
        type=args.type,
        message=args.message,
        retry_count=args.retry_count,
        note=args.note,
    )
    print(f"ok: wrote workflow state: {args.path}")


def cmd_history(args: argparse.Namespace) -> None:
    append_history(
        args.path,
        note=args.note,
        phase=args.phase,
        status=args.status,
    )
    print(f"ok: wrote workflow state: {args.path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="create a new workflow-state file")
    init.add_argument("path", type=Path)
    init.add_argument("--task-id", required=True)
    init.add_argument("--title", default="")
    init.add_argument("--phase", default="intake")
    init.add_argument("--status", default="pending")
    init.add_argument("--role", default="orchestrator")
    init.add_argument("--next-action", default="")
    init.set_defaults(func=cmd_init)

    set_cmd = sub.add_parser("set", help="update phase/status/role/next action")
    set_cmd.add_argument("path", type=Path)
    set_cmd.add_argument("--phase")
    set_cmd.add_argument("--status")
    set_cmd.add_argument("--role")
    set_cmd.add_argument("--next-action")
    set_cmd.add_argument("--note")
    set_cmd.set_defaults(func=cmd_set)

    ac = sub.add_parser("ac", help="add or update an acceptance criterion")
    ac.add_argument("path", type=Path)
    ac.add_argument("--id", required=True)
    ac.add_argument("--criterion")
    ac.add_argument("--status", default="pending")
    ac.add_argument("--evidence")
    ac.add_argument("--note")
    ac.set_defaults(func=cmd_ac)

    fail_cmd = sub.add_parser("fail", help="record failure metadata")
    fail_cmd.add_argument("path", type=Path)
    fail_cmd.add_argument("--type", default="fixable")
    fail_cmd.add_argument("--message", default="")
    fail_cmd.add_argument("--retry-count", type=int, default=0)
    fail_cmd.add_argument("--note")
    fail_cmd.set_defaults(func=cmd_fail)

    history_cmd = sub.add_parser("history", help="append a history entry")
    history_cmd.add_argument("path", type=Path)
    history_cmd.add_argument("--note", required=True)
    history_cmd.add_argument("--phase")
    history_cmd.add_argument("--status")
    history_cmd.set_defaults(func=cmd_history)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
