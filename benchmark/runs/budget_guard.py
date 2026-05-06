"""Print budget status for a run.

CLI:
    python -m benchmark.runs.budget_guard <run_dir>

Output:
    total spent: $X.XX, n_tasks=N, n_responses=N, n_fallback_events=N
"""

from __future__ import annotations

import json
import pathlib
import sys


def report(run_dir: str | pathlib.Path) -> str:
    run_dir = pathlib.Path(run_dir)
    events_path = run_dir / "events.jsonl"
    if not events_path.exists():
        raise FileNotFoundError(f"events.jsonl not found in {run_dir}")

    spent = 0.0
    n_tasks = 0
    n_responses = 0
    n_fallback = 0
    seen: set[str] = set()
    with events_path.open("r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            ev = json.loads(raw)
            kind = ev.get("event")
            if kind == "task_start":
                tid = ev.get("task_id")
                if tid and tid not in seen:
                    seen.add(tid)
                    n_tasks += 1
            elif kind == "response":
                n_responses += 1
                if "cost_usd" in ev:
                    spent += float(ev["cost_usd"])
            elif kind == "fallback_triggered":
                n_fallback += 1

    return (
        f"total spent: ${spent:.4f}, n_tasks={n_tasks}, "
        f"n_responses={n_responses}, n_fallback_events={n_fallback}"
    )


def _main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m benchmark.runs.budget_guard <run_dir>", file=sys.stderr)
        return 2
    print(report(argv[0]))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
