"""Print a one-line CSV summary for a run.

CLI:
    python -m benchmark.runs.summary <run_dir>

Reads events.jsonl, aggregates totals, and emits:
    run_id,benchmark,arm,model,n_tasks,total_tokens_in,total_tokens_out,total_cost_usd,wallclock_seconds,n_errors
"""

from __future__ import annotations

import csv
import datetime as _dt
import io
import json
import pathlib
import sys

from .recorder import PRICING


def _parse_iso(ts: str) -> float:
    if ts.endswith("Z"):
        ts = ts[:-1]
    return _dt.datetime.fromisoformat(ts).timestamp()


def _cost_for(model: str, tokens: dict) -> float:
    rates = PRICING.get(model)
    if not rates:
        return 0.0
    return (
        tokens.get("input", 0) * rates["in"]
        + tokens.get("output", 0) * rates["out"]
        + tokens.get("cache_read", 0) * rates["cache_read"]
        + tokens.get("cache_write", 0) * rates["cache_write"]
    ) / 1_000_000.0


def summarize(run_dir: str | pathlib.Path) -> str:
    run_dir = pathlib.Path(run_dir)
    events_path = run_dir / "events.jsonl"
    if not events_path.exists():
        raise FileNotFoundError(f"events.jsonl not found in {run_dir}")

    run_id = benchmark = arm = model = ""
    n_tasks = total_in = total_out = n_errors = 0
    total_cost = 0.0
    t_first: float | None = None
    t_last: float | None = None
    task_ids: set[str] = set()

    with events_path.open("r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            ev = json.loads(raw)
            ts = ev.get("ts")
            if ts:
                tval = _parse_iso(ts)
                t_first = tval if t_first is None else min(t_first, tval)
                t_last = tval if t_last is None else max(t_last, tval)
            kind = ev.get("event")
            if kind == "run_start":
                run_id = ev.get("run_id", "")
                benchmark = ev.get("benchmark", "")
                arm = ev.get("arm", "")
                model = ev.get("model", "")
            elif kind == "task_start":
                tid = ev.get("task_id")
                if tid and tid not in task_ids:
                    task_ids.add(tid)
                    n_tasks += 1
            elif kind == "response":
                tk = ev.get("tokens", {}) or {}
                total_in += tk.get("input", 0)
                total_out += tk.get("output", 0)
                if "cost_usd" in ev:
                    total_cost += float(ev["cost_usd"])
                else:
                    total_cost += _cost_for(model, tk)
            elif kind == "task_end":
                if ev.get("status") and ev["status"] != "ok":
                    n_errors += 1
            elif kind == "error":
                n_errors += 1

    wallclock = round((t_last - t_first), 3) if (t_first and t_last) else 0.0

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            run_id,
            benchmark,
            arm,
            model,
            n_tasks,
            total_in,
            total_out,
            round(total_cost, 6),
            wallclock,
            n_errors,
        ]
    )
    return buf.getvalue().rstrip("\n")


def _main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m benchmark.runs.summary <run_dir>", file=sys.stderr)
        return 2
    print(summarize(argv[0]))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
