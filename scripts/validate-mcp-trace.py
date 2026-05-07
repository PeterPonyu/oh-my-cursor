#!/usr/bin/env python3
"""Validate the bridge trace file against the schema fixture.

Phase 6 of mcp-state-bridge-2026-05.

Default mode scans the last 50 entries of
``.omcs/cursor-state-bridge/trace.jsonl`` and asserts each one carries
the required keys defined in
``mcp/cursor-state-bridge/fixtures/trace-schema.json``
(``ts``, ``tool``, ``phase``, ``result``, ``duration_ms``).

``--self-test`` seeds a clean fixture and a malformed fixture inside an
isolated :class:`tempfile.TemporaryDirectory` (V2), confirms the clean
file passes and the malformed file is rejected, and never mutates the
working tree.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TRACE = ROOT / ".omcs" / "cursor-state-bridge" / "trace.jsonl"
SCHEMA_PATH = ROOT / "mcp" / "cursor-state-bridge" / "fixtures" / "trace-schema.json"
REQUIRED_KEYS = {"ts", "tool", "phase", "result", "duration_ms"}


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _ok(message: str) -> None:
    print(f"ok: {message}")


def _validate_lines(lines: Iterable[str]) -> list[str]:
    errors: list[str] = []
    for index, raw in enumerate(lines):
        line = raw.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"line {index}: malformed JSON: {exc}")
            continue
        if not isinstance(obj, dict):
            errors.append(f"line {index}: not an object")
            continue
        missing = REQUIRED_KEYS - set(obj.keys())
        if missing:
            errors.append(f"line {index}: missing required keys: {sorted(missing)}")
            continue
        if not isinstance(obj.get("duration_ms"), (int, float)):
            errors.append(f"line {index}: duration_ms must be numeric")
    return errors


def run_self_test() -> int:
    with tempfile.TemporaryDirectory() as td:
        sandbox = Path(td)
        clean = sandbox / "clean.jsonl"
        clean.write_text(
            "\n".join(
                [
                    json.dumps(
                        {
                            "ts": "2026-05-07T01:00:00Z",
                            "tool": "state_read",
                            "phase": "tools/call",
                            "result": "ok",
                            "duration_ms": 12,
                        }
                    ),
                    json.dumps(
                        {
                            "ts": "2026-05-07T01:00:01Z",
                            "tool": "state_init",
                            "phase": "tools/call",
                            "result": "ok",
                            "duration_ms": 8,
                        }
                    ),
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        clean_errors = _validate_lines(clean.read_text(encoding="utf-8").splitlines())
        if clean_errors:
            _fail(f"self-test clean fixture rejected: {clean_errors}")
        _ok("self-test clean fixture passes")

        bad = sandbox / "bad.jsonl"
        bad.write_text(
            "\n".join(
                [
                    json.dumps({"ts": "2026-05-07T01:00:00Z", "tool": "x"}),
                    "{not valid json",
                    json.dumps(
                        {
                            "ts": "2026-05-07T01:00:00Z",
                            "tool": "y",
                            "phase": "z",
                            "result": "ok",
                            "duration_ms": "not-a-number",
                        }
                    ),
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        bad_errors = _validate_lines(bad.read_text(encoding="utf-8").splitlines())
        if len(bad_errors) < 3:
            _fail(
                f"self-test bad fixture should have surfaced >=3 errors, "
                f"got {len(bad_errors)}: {bad_errors}"
            )
        _ok(f"self-test bad fixture rejected with {len(bad_errors)} errors")

    print("VALIDATE_MCP_TRACE_SELF_TEST_OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--self-test" in args:
        return run_self_test()

    tail = 50
    path = DEFAULT_TRACE
    while args:
        token = args.pop(0)
        if token == "--tail" and args:
            tail = int(args.pop(0))
        elif token == "--path" and args:
            path = Path(args.pop(0)).expanduser()
        else:
            _fail(f"unknown argument: {token}")

    if not SCHEMA_PATH.is_file():
        _fail(f"schema fixture missing: {SCHEMA_PATH}")
    if not path.is_file():
        _fail(f"trace file not found: {path}")

    raw_lines = path.read_text(encoding="utf-8").splitlines()
    relevant = [line for line in raw_lines if line.strip()][-tail:]
    errors = _validate_lines(relevant)
    if errors:
        print("FAIL: trace validation errors:", file=sys.stderr)
        for line in errors:
            print(f"  {line}", file=sys.stderr)
        return 1
    _ok(f"last {len(relevant)} trace lines schema-conformant: {path}")
    print("MCP_TRACE_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
