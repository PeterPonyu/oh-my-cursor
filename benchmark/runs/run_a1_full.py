"""A1-full: 60 tasks x 2 arms = 120 invocations on cursor-agent CLI.

Mirrors ``pilot/run_a1_pilot.py`` but loads the 60-task fixture from
``pilot/a1_full_tasks.json`` and uses ``benchmark="A1-full"`` so the
recorder run-dir prefix differs from the 3-task pilot.

Pre-flight: aborts with exit code 2 if the cursor-agent binary is missing.
For each arm a fresh Recorder is created and the run directory is printed.
Per-arm budget: $5.00 USD-equivalent. Per-task errors are caught and
logged — one bad task does not kill the run. Progress is printed every
10 completed tasks per arm.

Arm semantics:
  - vanilla  : cwd is a fresh empty tempdir; no Cursor skills auto-load.
  - with-omc : cwd is the OMC repo root; the ported skills auto-load
               from <repo>/skills/.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import sys
import tempfile
import time


THIS_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = THIS_DIR.parents[1]  # /home/zeyufu/Desktop/oh-my-cursor

# Make `benchmark.runs` importable regardless of cwd.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from benchmark.runs.host_client import CursorCLIError, call_cursor  # noqa: E402
from benchmark.runs.recorder import Recorder  # noqa: E402


DEFAULT_MODEL_ARG = "auto"
BUDGET = 5.0
TIMEOUT = 360.0
MAX_RETRIES = 2  # one initial + one retry on transient failures
RETRY_BACKOFF_S = 8.0
PROGRESS_EVERY = 10
ARMS = ("vanilla", "with-omc")

TASKS_PATH = THIS_DIR / "pilot" / "a1_full_tasks.json"


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
        benchmark="A1-full",
        arm=arm,
        model=model,
        budget_usd=BUDGET,
        fallback_model=None,
    )
    print(f"  cwd={arm_cwd}")

    n_total = len(tasks)
    done = 0
    errors = 0
    aborted = False

    for task in tasks:
        tid = task["id"]
        skill = task["skill"]
        user = task["prompt"]

        meta = {"skill": skill, "arm_kind": arm, "cwd": str(arm_cwd)}
        rec.task_start(tid, user, metadata=meta)

        rec.request(tid, _request_body(user, arm_cwd, model_arg))

        out = None
        last_exc = None
        for attempt in range(MAX_RETRIES):
            try:
                out = call_cursor(
                    user,
                    workdir=str(arm_cwd),
                    model=model_arg,
                    timeout=timeout,
                )
                break
            except CursorCLIError as exc:
                last_exc = exc
                msg = str(exc).lower()
                transient = ("timed out" in msg or "tls" in msg or "network" in msg
                             or "socket" in msg or "disconnect" in msg or "503" in msg
                             or "504" in msg or "502" in msg)
                if attempt < MAX_RETRIES - 1 and transient:
                    print(f"  [{tid}] retry {attempt+1} after transient error: {exc}", file=sys.stderr)
                    time.sleep(RETRY_BACKOFF_S)
                    continue
                break
        if out is None:
            exc = last_exc
            print(f"  [{tid}] CursorCLIError: {exc}", file=sys.stderr)
            rec.task_end(tid, status="error", error=str(exc))
            errors += 1
            done += 1
            if done % PROGRESS_EVERY == 0:
                print(
                    f"[arm={arm}] {done}/{n_total} done, "
                    f"spent=${rec.total_cost_usd:.4f}, errors={errors}"
                )
            continue

        decision = rec.response(
            tid, out["raw"], out["tokens"], out["wallclock_ms"]
        )
        rec.task_end(tid, status="ok")
        done += 1
        if done % PROGRESS_EVERY == 0:
            print(
                f"[arm={arm}] {done}/{n_total} done, "
                f"spent=${rec.total_cost_usd:.4f}, errors={errors}"
            )
        if decision == "abort":
            print(
                f"  [{tid}] budget exceeded (spent=${rec.total_cost_usd:.4f}); "
                f"stopping arm at {done}/{n_total}"
            )
            aborted = True
            break

    rec.run_end(status="ok")
    print(
        f"[arm={arm}] FINAL {done}/{n_total} done, "
        f"spent=${rec.total_cost_usd:.4f}, errors={errors}"
        + (" (BUDGET-ABORTED)" if aborted else "")
    )
    return rec


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Cursor A1-full with explicit --model forwarding."
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
    print(f"Budget: ${BUDGET:.2f} per arm")
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
