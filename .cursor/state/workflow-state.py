#!/usr/bin/env python3
"""Create or update an oh-my-cursor workflow-state JSON document.

This runtime helper is shipped inside the minimal Cursor plugin payload under
`.cursor/state/`, so installed plugin users can create or update workflow state
without pulling in repository development scripts.
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path


PHASES = {"intake", "research", "plan", "execute", "verify", "review", "done", "blocked"}
STATUSES = {"pending", "in_progress", "passed", "failed", "blocked"}
ROLES = {"", "orchestrator", "researcher", "planner", "implementer", "verifier", "critic", "debugger", "security-reviewer"}
AC_STATUSES = {"pending", "passed", "failed", "skipped"}
FAILURE_TYPES = {"", "transient", "fixable", "needs_replan", "escalate", "flaky", "regression"}


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def load_state(path: Path) -> dict:
    if not path.exists():
        fail(f"state file does not exist: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"state file is not valid JSON: {exc}")
    if not isinstance(value, dict):
        fail("state root must be a JSON object")
    return value


def write_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"ok: wrote workflow state: {path}")


def append_history(state: dict, note: str) -> None:
    history = state.setdefault("history", [])
    if isinstance(history, list):
        history.append({"phase": str(state.get("phase", "")), "status": str(state.get("status", "")), "note": note, "at": date.today().isoformat()})


def cmd_init(args: argparse.Namespace) -> None:
    if args.phase not in PHASES:
        fail(f"phase must be one of {sorted(PHASES)}")
    if args.status not in STATUSES:
        fail(f"status must be one of {sorted(STATUSES)}")
    if args.role not in ROLES:
        fail(f"role must be one of {sorted(ROLES)}")
    state = {
        "task_id": args.task_id,
        "title": args.title or args.task_id,
        "phase": args.phase,
        "status": args.status,
        "current_role": args.role,
        "next_action": args.next_action or "define acceptance criteria and route to orchestrator",
        "acceptance_criteria": [],
        "failure": {"type": "", "message": "", "retry_count": 0},
        "history": [],
    }
    append_history(state, "initialized workflow state")
    write_state(args.path, state)


def cmd_set(args: argparse.Namespace) -> None:
    state = load_state(args.path)
    if args.phase:
        if args.phase not in PHASES:
            fail(f"phase must be one of {sorted(PHASES)}")
        state["phase"] = args.phase
    if args.status:
        if args.status not in STATUSES:
            fail(f"status must be one of {sorted(STATUSES)}")
        state["status"] = args.status
    if args.role is not None:
        if args.role not in ROLES:
            fail(f"role must be one of {sorted(ROLES)}")
        state["current_role"] = args.role
    if args.next_action is not None:
        state["next_action"] = args.next_action
    append_history(state, args.note or "updated workflow state")
    write_state(args.path, state)


def cmd_ac(args: argparse.Namespace) -> None:
    state = load_state(args.path)
    if args.status not in AC_STATUSES:
        fail(f"acceptance criterion status must be one of {sorted(AC_STATUSES)}")
    criteria = state.setdefault("acceptance_criteria", [])
    if not isinstance(criteria, list):
        fail("acceptance_criteria must be a list")
    target = None
    for item in criteria:
        if isinstance(item, dict) and item.get("id") == args.id:
            target = item
            break
    if target is None:
        criteria.append({"id": args.id, "criterion": args.criterion or args.id, "status": args.status, "evidence": args.evidence or ""})
    else:
        if args.criterion is not None:
            target["criterion"] = args.criterion
        target["status"] = args.status
        if args.evidence is not None:
            target["evidence"] = args.evidence
    append_history(state, args.note or f"updated acceptance criterion {args.id}")
    write_state(args.path, state)


def cmd_fail(args: argparse.Namespace) -> None:
    state = load_state(args.path)
    if args.type not in FAILURE_TYPES:
        fail(f"failure type must be one of {sorted(FAILURE_TYPES)}")
    if args.retry_count < 0 or args.retry_count > 3:
        fail("retry-count must be between 0 and 3")
    state["status"] = "failed" if args.type else state.get("status", "failed")
    state["failure"] = {"type": args.type, "message": args.message or "", "retry_count": args.retry_count}
    append_history(state, args.note or f"recorded failure type {args.type}")
    write_state(args.path, state)


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

    return parser


def main() -> int:
    args = build_parser().parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
