"""Append-only Recorder for benchmark runs.

Writes a per-run directory under benchmark/runs/data/ containing:
  manifest.json       run config + final totals
  events.jsonl        canonical append-only event stream
  summary.csv         single-row aggregate
  replay.txt          rendered transcript (auto at run_end)
  per-task/<id>/      prompt.md, request.json, response.md, response_raw.json, metadata.json
"""

from __future__ import annotations

import csv
import datetime as _dt
import io
import json
import os
import pathlib
import re
import time
import uuid


# USD per million tokens
PRICING: dict[str, dict[str, float]] = {
    "anthropic/claude-haiku-4-5-20251001": {
        "in": 1.0,
        "out": 5.0,
        "cache_read": 0.10,
        "cache_write": 1.25,
    },
    "anthropic/claude-sonnet-4-6": {
        "in": 3.0,
        "out": 15.0,
        "cache_read": 0.30,
        "cache_write": 3.75,
    },
    "anthropic/claude-opus-4-7": {
        "in": 15.0,
        "out": 75.0,
        "cache_read": 1.50,
        "cache_write": 18.75,
    },
    # cursor-agent uses Anthropic Sonnet 4 by default; rough USD estimate
    # using Sonnet rates as a proxy for cost-of-equivalent-tokens. Cursor
    # itself bills in credits, not USD; see schema.md for the caveat.
    "cursor/sonnet-4": {
        "in": 3.0,
        "out": 15.0,
        "cache_read": 0.30,
        "cache_write": 3.75,
    },
    "cursor/auto": {
        "in": 3.0,
        "out": 15.0,
        "cache_read": 0.30,
        "cache_write": 3.75,
    },
}


_RUNS_ROOT = pathlib.Path(__file__).resolve().parent / "data"


def _utc_ts() -> str:
    return _dt.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")


def _flatten_model(model: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", model)


def _cost_usd(model: str, tokens: dict) -> float:
    rates = PRICING.get(model)
    if not rates:
        return 0.0
    return (
        tokens.get("input", 0) * rates["in"]
        + tokens.get("output", 0) * rates["out"]
        + tokens.get("cache_read", 0) * rates["cache_read"]
        + tokens.get("cache_write", 0) * rates["cache_write"]
    ) / 1_000_000.0


class Recorder:
    """Records a single benchmark run."""

    def __init__(
        self,
        benchmark: str,
        arm: str,
        model: str,
        budget_usd: float,
        fallback_model: str | None = None,
    ) -> None:
        self.benchmark = benchmark
        self.arm = arm
        self.model = model
        self.budget_usd = float(budget_usd)
        self.fallback_model = fallback_model
        self.run_id = uuid.uuid4().hex[:12]
        self.started_at = _utc_ts()
        self._t_start = time.time()

        run_name = f"{self.started_at}__{benchmark}__{arm}__{_flatten_model(model)}__{self.run_id}"
        self.run_dir = _RUNS_ROOT / run_name
        self.per_task_dir = self.run_dir / "per-task"
        self.per_task_dir.mkdir(parents=True, exist_ok=True)

        self.events_path = self.run_dir / "events.jsonl"
        self.manifest_path = self.run_dir / "manifest.json"
        self.summary_path = self.run_dir / "summary.csv"
        self.replay_path = self.run_dir / "replay.txt"

        # Aggregates
        self.total_tokens_in = 0
        self.total_tokens_out = 0
        self.total_tokens_cache_read = 0
        self.total_tokens_cache_write = 0
        self.total_cost_usd = 0.0
        self.n_tasks = 0
        self.n_responses = 0
        self.n_errors = 0
        self.n_fallback_events = 0
        self.fallback_active = False
        self._task_ids: set[str] = set()

        self._write_event(
            "run_start",
            {
                "run_id": self.run_id,
                "benchmark": benchmark,
                "arm": arm,
                "model": model,
                "fallback_model": fallback_model,
                "budget_usd": self.budget_usd,
                "started_at": self.started_at,
            },
        )
        self._write_manifest(status="running")

    # ------------------------------------------------------------------ utils
    def _write_event(self, event_type: str, payload: dict) -> None:
        record = {"ts": _dt.datetime.utcnow().isoformat() + "Z", "event": event_type}
        record.update(payload)
        with self.events_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def _task_dir(self, task_id: str) -> pathlib.Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", task_id)
        d = self.per_task_dir / safe
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _write_manifest(self, status: str) -> None:
        manifest = {
            "run_id": self.run_id,
            "benchmark": self.benchmark,
            "arm": self.arm,
            "model": self.model,
            "fallback_model": self.fallback_model,
            "budget_usd": self.budget_usd,
            "started_at": self.started_at,
            "status": status,
            "totals": {
                "n_tasks": self.n_tasks,
                "n_responses": self.n_responses,
                "n_errors": self.n_errors,
                "n_fallback_events": self.n_fallback_events,
                "tokens_in": self.total_tokens_in,
                "tokens_out": self.total_tokens_out,
                "tokens_cache_read": self.total_tokens_cache_read,
                "tokens_cache_write": self.total_tokens_cache_write,
                "cost_usd": round(self.total_cost_usd, 6),
                "wallclock_seconds": round(time.time() - self._t_start, 3),
            },
            "run_dir": str(self.run_dir),
        }
        self.manifest_path.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    # ------------------------------------------------------------------ events
    def task_start(self, task_id: str, prompt: str, metadata: dict | None = None) -> None:
        if task_id not in self._task_ids:
            self._task_ids.add(task_id)
            self.n_tasks += 1
        meta = metadata or {}
        td = self._task_dir(task_id)

        # prompt.md (system + user split if metadata['system'] is present)
        system = meta.get("system")
        prompt_md_parts = []
        if system:
            prompt_md_parts.append("## System message\n\n" + system.strip() + "\n")
        prompt_md_parts.append("## User prompt\n\n" + prompt.strip() + "\n")
        (td / "prompt.md").write_text("\n".join(prompt_md_parts), encoding="utf-8")

        self._write_event(
            "task_start",
            {"task_id": task_id, "prompt_chars": len(prompt), "metadata": meta},
        )

    def request(self, task_id: str, payload: dict) -> None:
        td = self._task_dir(task_id)
        (td / "request.json").write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        self._write_event("request", {"task_id": task_id, "payload_keys": sorted(payload.keys())})

    def response(
        self,
        task_id: str,
        payload: dict,
        tokens: dict,
        wallclock_ms: int,
    ) -> str:
        """Record a response. Returns 'continue' | 'fallback' | 'abort'."""
        td = self._task_dir(task_id)
        (td / "response_raw.json").write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        # Extract assistant text for response.md (handles Anthropic API + Claude Code CLI shapes)
        if isinstance(payload.get("result"), str) and payload.get("type") == "result":
            response_text = payload["result"]
        else:
            text_parts: list[str] = []
            for block in payload.get("content", []) or []:
                if isinstance(block, dict) and block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
            response_text = "".join(text_parts)
        (td / "response.md").write_text(response_text or "(empty response)", encoding="utf-8")

        self.n_responses += 1
        self.total_tokens_in += tokens.get("input", 0)
        self.total_tokens_out += tokens.get("output", 0)
        self.total_tokens_cache_read += tokens.get("cache_read", 0)
        self.total_tokens_cache_write += tokens.get("cache_write", 0)

        cost = _cost_usd(self.model, tokens)
        self.total_cost_usd += cost

        (td / "metadata.json").write_text(
            json.dumps(
                {
                    "model": self.model,
                    "tokens": tokens,
                    "cost_usd": round(cost, 6),
                    "wallclock_ms": wallclock_ms,
                    "stop_reason": payload.get("stop_reason"),
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        self._write_event(
            "response",
            {
                "task_id": task_id,
                "tokens": tokens,
                "cost_usd": round(cost, 6),
                "wallclock_ms": wallclock_ms,
                "stop_reason": payload.get("stop_reason"),
            },
        )

        # Budget control
        decision = "continue"
        if self.total_cost_usd >= self.budget_usd:
            if self.fallback_model and not self.fallback_active:
                self.fallback_active = True
                self.n_fallback_events += 1
                prev = self.model
                self.model = self.fallback_model
                self._write_event(
                    "fallback_triggered",
                    {
                        "from_model": prev,
                        "to_model": self.fallback_model,
                        "spent_usd": round(self.total_cost_usd, 6),
                        "budget_usd": self.budget_usd,
                    },
                )
                decision = "fallback"
            else:
                self._write_event(
                    "budget_exceeded",
                    {
                        "spent_usd": round(self.total_cost_usd, 6),
                        "budget_usd": self.budget_usd,
                    },
                )
                decision = "abort"
        elif self.total_cost_usd >= 0.8 * self.budget_usd:
            self._write_event(
                "budget_warning",
                {
                    "spent_usd": round(self.total_cost_usd, 6),
                    "budget_usd": self.budget_usd,
                    "fraction": round(self.total_cost_usd / self.budget_usd, 4),
                },
            )

        return decision

    def tool_call(self, task_id: str, name: str, args: dict) -> None:
        self._write_event(
            "tool_call", {"task_id": task_id, "name": name, "args": args}
        )

    def tool_result(self, task_id: str, name: str, result) -> None:
        self._write_event(
            "tool_result", {"task_id": task_id, "name": name, "result": result}
        )

    def rubric_score(
        self, task_id: str, rubric: dict, total: float, rater: str = "self"
    ) -> None:
        self._write_event(
            "rubric_score",
            {"task_id": task_id, "rubric": rubric, "total": total, "rater": rater},
        )

    def task_end(self, task_id: str, status: str = "ok", error: str | None = None) -> None:
        if status != "ok":
            self.n_errors += 1
        payload = {"task_id": task_id, "status": status}
        if error:
            payload["error"] = error
            self._write_event("error", {"task_id": task_id, "error": error})
        self._write_event("task_end", payload)

    def run_end(self, status: str = "ok") -> None:
        self._write_event(
            "run_end",
            {
                "status": status,
                "totals": {
                    "n_tasks": self.n_tasks,
                    "n_responses": self.n_responses,
                    "n_errors": self.n_errors,
                    "n_fallback_events": self.n_fallback_events,
                    "tokens_in": self.total_tokens_in,
                    "tokens_out": self.total_tokens_out,
                    "cost_usd": round(self.total_cost_usd, 6),
                    "wallclock_seconds": round(time.time() - self._t_start, 3),
                },
            },
        )
        self._write_manifest(status=status)
        self._write_summary_csv()
        self._write_replay()

    # ------------------------------------------------------------------ outputs
    def _write_summary_csv(self) -> None:
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "run_id",
                "benchmark",
                "arm",
                "model",
                "n_tasks",
                "total_tokens_in",
                "total_tokens_out",
                "total_cost_usd",
                "wallclock_seconds",
                "n_errors",
            ]
        )
        w.writerow(
            [
                self.run_id,
                self.benchmark,
                self.arm,
                self.model,
                self.n_tasks,
                self.total_tokens_in,
                self.total_tokens_out,
                round(self.total_cost_usd, 6),
                round(time.time() - self._t_start, 3),
                self.n_errors,
            ]
        )
        self.summary_path.write_text(buf.getvalue(), encoding="utf-8")

    def _write_replay(self) -> None:
        # Defer to the replay module so logic is shared with the CLI.
        from .replay import render_replay  # local import to avoid cycle at load

        render_replay(self.run_dir)
