"""Render a human-readable replay.txt from events.jsonl.

CLI:
    python -m benchmark.runs.replay <run_dir>
"""

from __future__ import annotations

import json
import pathlib
import sys


def render_replay(run_dir: str | pathlib.Path) -> pathlib.Path:
    run_dir = pathlib.Path(run_dir)
    events_path = run_dir / "events.jsonl"
    out_path = run_dir / "replay.txt"
    if not events_path.exists():
        raise FileNotFoundError(f"events.jsonl not found in {run_dir}")

    lines: list[str] = []
    with events_path.open("r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                ev = json.loads(raw)
            except json.JSONDecodeError:
                lines.append(f"[BAD JSON] {raw}")
                continue
            ts = ev.get("ts", "?")
            kind = ev.get("event", "?")
            tid = ev.get("task_id", "")
            head = f"[{ts}] {kind}" + (f" task={tid}" if tid else "")

            if kind == "run_start":
                lines.append(head)
                lines.append(
                    f"  benchmark={ev.get('benchmark')} arm={ev.get('arm')} "
                    f"model={ev.get('model')} budget=${ev.get('budget_usd')}"
                )
            elif kind == "task_start":
                lines.append(head + f"  prompt_chars={ev.get('prompt_chars')}")
            elif kind == "request":
                lines.append(head + f"  keys={ev.get('payload_keys')}")
            elif kind == "response":
                tk = ev.get("tokens", {})
                lines.append(
                    head
                    + f"  in={tk.get('input', 0)} out={tk.get('output', 0)}"
                    + f" cost=${ev.get('cost_usd')} ms={ev.get('wallclock_ms')}"
                    + f" stop={ev.get('stop_reason')}"
                )
            elif kind == "tool_call":
                lines.append(head + f"  name={ev.get('name')} args={ev.get('args')}")
            elif kind == "tool_result":
                res = ev.get("result")
                snippet = (
                    json.dumps(res)[:200] if not isinstance(res, str) else res[:200]
                )
                lines.append(head + f"  name={ev.get('name')} result={snippet}")
            elif kind == "rubric_score":
                lines.append(
                    head
                    + f"  rater={ev.get('rater')} total={ev.get('total')}"
                    + f" rubric={ev.get('rubric')}"
                )
            elif kind == "task_end":
                lines.append(head + f"  status={ev.get('status')}")
            elif kind == "error":
                lines.append(head + f"  error={ev.get('error')}")
            elif kind == "budget_warning":
                lines.append(
                    head
                    + f"  spent=${ev.get('spent_usd')} budget=${ev.get('budget_usd')}"
                    + f" frac={ev.get('fraction')}"
                )
            elif kind == "fallback_triggered":
                lines.append(
                    head
                    + f"  from={ev.get('from_model')} to={ev.get('to_model')}"
                    + f" spent=${ev.get('spent_usd')}"
                )
            elif kind == "budget_exceeded":
                lines.append(
                    head
                    + f"  spent=${ev.get('spent_usd')} budget=${ev.get('budget_usd')}"
                )
            elif kind == "run_end":
                tot = ev.get("totals", {})
                lines.append(head + f"  status={ev.get('status')} totals={tot}")
            else:
                lines.append(head + f"  {ev}")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out_path


def _main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m benchmark.runs.replay <run_dir>", file=sys.stderr)
        return 2
    out = render_replay(argv[0])
    print(str(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
