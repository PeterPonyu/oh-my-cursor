"""Command-line interface for workflow-state document updates."""
from __future__ import annotations

import argparse
from pathlib import Path

from .api import (
    DEFAULT_HISTORY_CAP,
    append_history,
    init_state,
    record_failure,
    set_state,
    update_acceptance_criterion,
)


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
        history_cap=args.history_cap,
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
        history_cap=args.history_cap,
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
        history_cap=args.history_cap,
    )
    print(f"ok: wrote workflow state: {args.path}")


def cmd_fail(args: argparse.Namespace) -> None:
    record_failure(
        args.path,
        type=args.type,
        message=args.message,
        retry_count=args.retry_count,
        note=args.note,
        history_cap=args.history_cap,
    )
    print(f"ok: wrote workflow state: {args.path}")


def cmd_history(args: argparse.Namespace) -> None:
    append_history(
        args.path,
        note=args.note,
        phase=args.phase,
        status=args.status,
        history_cap=args.history_cap,
    )
    print(f"ok: wrote workflow state: {args.path}")


def _add_history_cap(parser: argparse.ArgumentParser) -> None:
    """Attach the shared ``--history-cap`` option (Phase 7)."""
    parser.add_argument(
        "--history-cap",
        type=int,
        default=DEFAULT_HISTORY_CAP,
        help=(
            f"FIFO eviction cap for history[] entries (default {DEFAULT_HISTORY_CAP}). "
            "Pass 0 to disable compaction."
        ),
    )


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
    _add_history_cap(init)
    init.set_defaults(func=cmd_init)

    set_cmd = sub.add_parser("set", help="update phase/status/role/next action")
    set_cmd.add_argument("path", type=Path)
    set_cmd.add_argument("--phase")
    set_cmd.add_argument("--status")
    set_cmd.add_argument("--role")
    set_cmd.add_argument("--next-action")
    set_cmd.add_argument("--note")
    _add_history_cap(set_cmd)
    set_cmd.set_defaults(func=cmd_set)

    ac = sub.add_parser("ac", help="add or update an acceptance criterion")
    ac.add_argument("path", type=Path)
    ac.add_argument("--id", required=True)
    ac.add_argument("--criterion")
    ac.add_argument("--status", default="pending")
    ac.add_argument("--evidence")
    ac.add_argument("--note")
    _add_history_cap(ac)
    ac.set_defaults(func=cmd_ac)

    fail_cmd = sub.add_parser("fail", help="record failure metadata")
    fail_cmd.add_argument("path", type=Path)
    fail_cmd.add_argument("--type", default="fixable")
    fail_cmd.add_argument("--message", default="")
    fail_cmd.add_argument("--retry-count", type=int, default=0)
    fail_cmd.add_argument("--note")
    _add_history_cap(fail_cmd)
    fail_cmd.set_defaults(func=cmd_fail)

    history_cmd = sub.add_parser("history", help="append a history entry")
    history_cmd.add_argument("path", type=Path)
    history_cmd.add_argument("--note", required=True)
    history_cmd.add_argument("--phase")
    history_cmd.add_argument("--status")
    _add_history_cap(history_cmd)
    history_cmd.set_defaults(func=cmd_history)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
