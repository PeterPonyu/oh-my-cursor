"""A1-style pilot: 3 tasks x 2 arms (vanilla, with-omc) on cursor-agent CLI.

Pre-flight: aborts with exit code 2 if the cursor-agent binary is missing.
For each (task, arm) cell a fresh Recorder is created and the resulting
run directory is printed. Budget cap: $2.0 USD-equivalent per arm
(see schema.md "Pricing note: cursor/* models" for the caveat).

Arm semantics:
  - vanilla  : cwd is a fresh empty tempdir; no Cursor skills auto-load.
  - with-omc : cwd is the OMC repo root; the 11 ported skills auto-load
               from <repo>/skills/.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import sys
import tempfile


THIS_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = THIS_DIR.parents[2]  # /home/zeyufu/Desktop/oh-my-cursor

# Make `benchmark.runs` importable regardless of cwd.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from benchmark.runs.host_client import CursorCLIError, call_cursor  # noqa: E402
from benchmark.runs.recorder import Recorder  # noqa: E402


DEFAULT_MODEL_ARG = "auto"
BUDGET = 2.0
TIMEOUT = 180.0
ARMS = ("vanilla", "with-omc")

TASKS_PATH = THIS_DIR / "a1_tasks.json"


def _resolve_cursor_binary() -> str | None:
    binary = shutil.which("cursor-agent")
    if binary:
        return binary
    fallback = "/home/zeyufu/.local/bin/cursor-agent"
    p = pathlib.Path(fallback)
    if p.is_file():
        return fallback
    return None


def _recorder_model(model_arg: str) -> str:
    return model_arg if model_arg.startswith("cursor/") else f"cursor/{model_arg}"


def _selected_arms(arm: str) -> tuple[str, ...]:
    return ARMS if arm == "both" else (arm,)


def _limited_tasks(tasks: list[dict], limit: int | None) -> list[dict]:
    if limit is None:
        return tasks
    if limit < 1:
        raise ValueError("--limit must be >= 1")
    return tasks[:limit]


def _request_body(task_prompt: str, arm_cwd: pathlib.Path, model_arg: str) -> dict:
    return {
        "backend": "cursor_cli",
        "model": _recorder_model(model_arg),
        "model_arg": model_arg,
        "prompt": task_prompt,
        "workdir": str(arm_cwd),
        "cmd": [
            "cursor-agent",
            "--print",
            "--trust",
            "--output-format",
            "json",
            "--model",
            model_arg,
            task_prompt,
        ],
    }


def _run_arm(
    arm: str,
    arm_cwd: pathlib.Path,
    tasks: list[dict],
    *,
    model_arg: str,
    timeout: float,
) -> Recorder:
    model = _recorder_model(model_arg)
    rec = Recorder(
        benchmark="a1-pilot",
        arm=arm,
        model=model,
        budget_usd=BUDGET,
        fallback_model=None,
    )
    print(f"  cwd={arm_cwd}")

    for task in tasks:
        tid = task["id"]
        skill = task["skill"]
        user = task["prompt"]

        meta = {"skill": skill, "arm_kind": arm, "cwd": str(arm_cwd)}
        rec.task_start(tid, user, metadata=meta)

        rec.request(tid, _request_body(user, arm_cwd, model_arg))

        try:
            out = call_cursor(
                user,
                workdir=str(arm_cwd),
                model=model_arg,
                timeout=timeout,
            )
        except CursorCLIError as exc:
            print(f"  [{tid}] ERROR: {exc}", file=sys.stderr)
            rec.task_end(tid, status="error", error=str(exc))
            continue

        decision = rec.response(
            tid, out["raw"], out["tokens"], out["wallclock_ms"]
        )
        rec.task_end(tid, status="ok")
        print(
            f"  [{tid}] tokens in/out={out['tokens']['input']}/{out['tokens']['output']} "
            f"cache_read={out['tokens']['cache_read']} "
            f"wall={out['wallclock_ms']}ms"
        )
        if decision == "abort":
            print(f"  [{tid}] budget exceeded; stopping arm")
            break

    rec.run_end(status="ok")
    return rec


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the Cursor A1 pilot with explicit --model forwarding."
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL_ARG,
        help="cursor-agent model argument to forward explicitly (default: auto)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Run only the first N tasks per selected arm for bounded smoke tests.",
    )
    parser.add_argument(
        "--arm",
        choices=(*ARMS, "both"),
        default="both",
        help="Which arm to run (default: both).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=TIMEOUT,
        help=f"cursor-agent timeout per task in seconds (default: {TIMEOUT:g}).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    binary = _resolve_cursor_binary()
    if binary is None:
        print(
            "ERROR: cursor-agent binary not found.\n"
            "Install Cursor Agent or place a binary at /home/zeyufu/.local/bin/cursor-agent.",
            file=sys.stderr,
        )
        return 2
    print(f"[preflight] cursor-agent binary: {binary}", file=sys.stderr)

    try:
        tasks = _limited_tasks(
            json.loads(TASKS_PATH.read_text(encoding="utf-8")), args.limit
        )
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(f"loaded {len(tasks)} tasks from {TASKS_PATH}")
    print(f"Model argument: --model {args.model} (recorded as {_recorder_model(args.model)})")
    print(f"Arms: {', '.join(_selected_arms(args.arm))}")

    # Vanilla cwd: empty tempdir (no skills/ -> nothing auto-loads).
    vanilla_cwd = pathlib.Path(tempfile.mkdtemp(prefix="cursor-vanilla-"))
    print(f"[preflight] vanilla cwd (empty): {vanilla_cwd}", file=sys.stderr)

    with_omc_cwd = REPO_ROOT
    print(f"[preflight] with-omc cwd: {with_omc_cwd}", file=sys.stderr)

    arm_cwds = {
        "vanilla": vanilla_cwd,
        "with-omc": with_omc_cwd,
    }

    run_dirs: list[pathlib.Path] = []
    try:
        for arm in _selected_arms(args.arm):
            print(f"\n=== arm={arm} ===")
            rec = _run_arm(
                arm,
                arm_cwds[arm],
                tasks,
                model_arg=args.model,
                timeout=args.timeout,
            )
            run_dirs.append(rec.run_dir)
            print(f"run_dir: {rec.run_dir}")
            print(
                f"  spent~=${rec.total_cost_usd:.4f} tasks={rec.n_tasks} "
                f"responses={rec.n_responses} errors={rec.n_errors} "
                f"tokens_in={rec.total_tokens_in} tokens_out={rec.total_tokens_out} "
                f"cache_read={rec.total_tokens_cache_read}"
            )
    finally:
        # Cleanup the empty vanilla scratch dir.
        try:
            shutil.rmtree(vanilla_cwd, ignore_errors=True)
            print(f"[cleanup] removed {vanilla_cwd}", file=sys.stderr)
        except Exception as exc:  # pragma: no cover
            print(f"[cleanup] failed to remove {vanilla_cwd}: {exc}", file=sys.stderr)

    print("\nrun directories:")
    for d in run_dirs:
        print(f"  {d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
