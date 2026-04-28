"""Audit benchmark run directories for stale or incomplete evidence.

The recorder history has used both ``event_type`` and ``event`` keys (and a few
external tools use ``type``), so this helper accepts all three while validating
run completeness. It is read-only: it reports stale/partial runs without
rewriting historical evidence.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

EVENT_KEYS = ("event", "event_type", "type")
REQUIRED_FINAL_ARTIFACTS = ("manifest.json", "events.jsonl", "summary.csv", "replay.txt")
OK_STATUSES = {"ok", "completed", "complete", "success"}
STALE_STATUSES = {"running", "in_progress", "started"}


@dataclass(frozen=True)
class RunAudit:
    path: Path
    manifest_status: str
    event_counts: dict[str, int]
    last_event: str
    last_event_ts: str
    missing_artifacts: list[str]
    task_start_count: int
    task_end_count: int
    request_count: int
    response_count: int
    error_count: int
    has_run_end: bool
    disposition: str
    problems: list[str]

    @property
    def complete(self) -> bool:
        return self.disposition == "complete"


def _event_kind(event: dict[str, Any]) -> str:
    for key in EVENT_KEYS:
        value = event.get(key)
        if isinstance(value, str) and value:
            return value
    return "<missing>"


def _read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as exc:
        return {"_audit_error": f"invalid JSON: {exc}"}
    return data if isinstance(data, dict) else {"_audit_error": "manifest is not an object"}


def _read_events(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    events: list[dict[str, Any]] = []
    problems: list[str] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return events, ["missing events.jsonl"]
    for lineno, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            problems.append(f"events.jsonl:{lineno}: invalid JSON: {exc}")
            continue
        if not isinstance(event, dict):
            problems.append(f"events.jsonl:{lineno}: event is not an object")
            continue
        events.append(event)
    return events, problems


def audit_run(run_dir: str | Path) -> RunAudit:
    path = Path(run_dir)
    manifest = _read_json(path / "manifest.json")
    events, problems = _read_events(path / "events.jsonl")
    if "_audit_error" in manifest:
        problems.append(f"manifest.json: {manifest['_audit_error']}")

    kinds = [_event_kind(event) for event in events]
    counts = Counter(kinds)
    last = events[-1] if events else {}
    last_event = _event_kind(last) if last else "<none>"
    last_event_ts = str(last.get("ts", "")) if last else ""
    manifest_status = str(manifest.get("status", "<missing>"))
    missing = [name for name in REQUIRED_FINAL_ARTIFACTS if not (path / name).exists()]

    task_start_count = counts.get("task_start", 0)
    task_end_count = counts.get("task_end", 0)
    request_count = counts.get("request", 0)
    response_count = counts.get("response", 0)
    error_count = counts.get("error", 0)
    has_run_end = counts.get("run_end", 0) > 0

    if manifest_status in STALE_STATUSES:
        problems.append(f"manifest status is {manifest_status}")
    if not has_run_end:
        problems.append("missing run_end event")
    if missing:
        problems.append("missing final artifacts: " + ", ".join(missing))
    if task_start_count != task_end_count:
        problems.append(f"task_start/task_end mismatch: {task_start_count}/{task_end_count}")
    if request_count != response_count:
        problems.append(f"request/response mismatch: {request_count}/{response_count}")
    if manifest_status not in OK_STATUSES and manifest_status not in STALE_STATUSES:
        problems.append(f"manifest status is not a known complete status: {manifest_status}")
    if error_count:
        problems.append(f"contains {error_count} error event(s)")

    if not events:
        disposition = "invalid-no-events"
    elif manifest_status in STALE_STATUSES or not has_run_end:
        disposition = "stale/superseded"
    elif missing or task_start_count != task_end_count or request_count != response_count or error_count:
        disposition = "incomplete"
    elif manifest_status in OK_STATUSES:
        disposition = "complete"
    else:
        disposition = "review"

    return RunAudit(
        path=path,
        manifest_status=manifest_status,
        event_counts=dict(sorted(counts.items())),
        last_event=last_event,
        last_event_ts=last_event_ts,
        missing_artifacts=missing,
        task_start_count=task_start_count,
        task_end_count=task_end_count,
        request_count=request_count,
        response_count=response_count,
        error_count=error_count,
        has_run_end=has_run_end,
        disposition=disposition,
        problems=problems,
    )


def discover_runs(data_dir: str | Path) -> list[Path]:
    root = Path(data_dir)
    if not root.exists():
        return []
    return sorted(path for path in root.iterdir() if path.is_dir() and (path / "events.jsonl").exists())


def _repo_relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(Path.cwd().resolve()))
    except ValueError:
        return str(path)


def audits_to_markdown(audits: Iterable[RunAudit], title: str = "Benchmark run audit") -> str:
    rows = list(audits)
    lines = [f"# {title}", "", "Generated by `benchmark/runs/audit_runs.py`. This report is read-only and does not rewrite historical run evidence.", ""]
    lines.append("| Run dir | Status | Events | Last event | Missing artifacts | Disposition |")
    lines.append("| --- | --- | ---: | --- | --- | --- |")
    for audit in rows:
        missing = ", ".join(audit.missing_artifacts) if audit.missing_artifacts else "—"
        lines.append(
            "| "
            + " | ".join(
                [
                    f"`{_repo_relative(audit.path)}`",
                    audit.manifest_status,
                    str(sum(audit.event_counts.values())),
                    f"{audit.last_event} {audit.last_event_ts}".strip(),
                    missing,
                    audit.disposition,
                ]
            )
            + " |"
        )
    lines.append("")
    lines.append("## Details")
    for audit in rows:
        lines.extend(
            [
                "",
                f"### `{_repo_relative(audit.path)}`",
                "",
                f"- Manifest status: `{audit.manifest_status}`",
                f"- Event counts: `{json.dumps(audit.event_counts, sort_keys=True)}`",
                f"- Task starts / ends: `{audit.task_start_count}` / `{audit.task_end_count}`",
                f"- Requests / responses: `{audit.request_count}` / `{audit.response_count}`",
                f"- Last event: `{audit.last_event}` `{audit.last_event_ts}`",
                f"- Missing artifacts: {', '.join(audit.missing_artifacts) if audit.missing_artifacts else 'none'}",
                f"- Disposition: **{audit.disposition}**",
            ]
        )
        if audit.problems:
            lines.append("- Findings:")
            lines.extend(f"  - {problem}" for problem in audit.problems)
        else:
            lines.append("- Findings: none")
    lines.append("")
    return "\n".join(lines)


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit benchmark run completeness without modifying run dirs.")
    parser.add_argument("paths", nargs="*", help="Run directories to audit. Defaults to benchmark/runs/data/*.")
    parser.add_argument("--data-dir", default=Path(__file__).resolve().parent / "data", help="Data directory for default discovery.")
    parser.add_argument("--markdown", action="store_true", help="Emit markdown instead of JSON.")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero if any audited run is incomplete/stale.")
    args = parser.parse_args(argv)

    run_dirs = [Path(p) for p in args.paths] if args.paths else discover_runs(args.data_dir)
    audits = [audit_run(path) for path in run_dirs]
    if args.markdown:
        print(audits_to_markdown(audits))
    else:
        print(json.dumps([audit.__dict__ | {"path": str(audit.path)} for audit in audits], indent=2, sort_keys=True))
    if args.strict and any(not audit.complete for audit in audits):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
