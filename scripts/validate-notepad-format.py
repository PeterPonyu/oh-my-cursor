#!/usr/bin/env python3
"""Validate a notepad markdown file against the three-section contract.

Usage:
  python3 scripts/validate-notepad-format.py [path]
  python3 scripts/validate-notepad-format.py --self-test

The notepad has three marker-bounded sections:

  ## Priority Context
  <!-- OMCS:NOTEPAD:PRIORITY -->
  ...body (replace-on-write, max 500 chars between markers)...
  <!-- /OMCS:NOTEPAD:PRIORITY -->

  ## Working Memory
  <!-- OMCS:NOTEPAD:WORKING -->
  ...body (timestamped lines, append-only)...
  <!-- /OMCS:NOTEPAD:WORKING -->

  ## MANUAL
  <!-- OMCS:NOTEPAD:MANUAL -->
  ...body (never auto-pruned)...
  <!-- /OMCS:NOTEPAD:MANUAL -->

The validator uses only the Python standard library so it runs anywhere
``python3`` is available. ``--self-test`` mode seeds a clean fixture and
four negative fixtures in a ``tempfile.TemporaryDirectory`` and confirms
each behaves as expected. The working tree is never mutated.
"""
from __future__ import annotations

import re
import sys
import tempfile
import textwrap
from pathlib import Path
from typing import NoReturn


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = ROOT / "docs" / "templates" / "notepad.md"
PRIORITY_CAP = 500
WORKING_TIMESTAMP_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+\S.*$"
)


# Section markers; the validator only inspects bodies between START and END.
SECTIONS = (
    ("priority", "## Priority Context", "<!-- OMCS:NOTEPAD:PRIORITY -->", "<!-- /OMCS:NOTEPAD:PRIORITY -->"),
    ("working", "## Working Memory", "<!-- OMCS:NOTEPAD:WORKING -->", "<!-- /OMCS:NOTEPAD:WORKING -->"),
    ("manual", "## MANUAL", "<!-- OMCS:NOTEPAD:MANUAL -->", "<!-- /OMCS:NOTEPAD:MANUAL -->"),
)


def _fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _ok(message: str) -> None:
    print(f"ok: {message}")


def _extract_section(text: str, header: str, start_marker: str, end_marker: str) -> str:
    """Return the body between the section markers, or raise SystemExit."""
    if header not in text:
        _fail(f"missing required header: {header}")
    start_idx = text.find(start_marker)
    end_idx = text.find(end_marker)
    if start_idx == -1:
        _fail(f"missing start marker: {start_marker}")
    if end_idx == -1:
        _fail(f"missing end marker: {end_marker}")
    if end_idx <= start_idx:
        _fail(f"end marker {end_marker!r} precedes start marker {start_marker!r}")
    body = text[start_idx + len(start_marker) : end_idx]
    return body


def _strip_comment_lines(body: str) -> str:
    """Return the non-comment body content used for cap calculations.

    The templates use HTML comments inside section bodies to give
    instructions. Those comment lines do not count toward the cap so the
    out-of-the-box template doesn't trip the cap before any real content
    has been added.
    """
    kept: list[str] = []
    for raw in body.splitlines():
        stripped = raw.strip()
        if not stripped:
            continue
        if stripped.startswith("<!--") and stripped.endswith("-->"):
            continue
        kept.append(raw)
    return "\n".join(kept)


def _validate_priority(body: str) -> None:
    payload = _strip_comment_lines(body)
    if len(payload) > PRIORITY_CAP:
        _fail(
            f"Priority Context exceeds {PRIORITY_CAP}-char cap: {len(payload)} chars present"
        )


def _validate_working(body: str) -> None:
    payload_lines = []
    for raw in body.splitlines():
        stripped = raw.strip()
        if not stripped:
            continue
        if stripped.startswith("<!--") and stripped.endswith("-->"):
            continue
        payload_lines.append(stripped)
    timestamps: list[str] = []
    for line_no, line in enumerate(payload_lines, start=1):
        m = WORKING_TIMESTAMP_RE.match(line)
        if not m:
            _fail(
                f"Working Memory line {line_no} does not start with an ISO 8601 UTC timestamp: {line[:120]}"
            )
        timestamps.append(m.group("ts"))
    if timestamps != sorted(timestamps):
        _fail("Working Memory timestamps are not sorted non-decreasing")


def _validate_manual(body: str) -> None:
    # MANUAL has no cap and no strict format. We only require the markers
    # exist (already checked) and the body is parseable as text.
    if "\x00" in body:
        _fail("MANUAL section contains a null byte")


def validate(path: Path) -> None:
    if not path.is_file():
        _fail(f"notepad file not found: {path}")
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        _fail(f"could not read {path}: {exc}")
    for key, header, start_marker, end_marker in SECTIONS:
        body = _extract_section(text, header, start_marker, end_marker)
        if key == "priority":
            _validate_priority(body)
        elif key == "working":
            _validate_working(body)
        elif key == "manual":
            _validate_manual(body)
    _ok(f"notepad format is valid: {path}")


# ---------------------------------------------------------------------------
# --self-test (V2 tempdir isolation)
# ---------------------------------------------------------------------------


_CLEAN_FIXTURE = textwrap.dedent(
    """
    # Project notepad

    ## Priority Context

    <!-- OMCS:NOTEPAD:PRIORITY -->
    Working on the memory layer refactor; bridge tools optional.
    <!-- /OMCS:NOTEPAD:PRIORITY -->

    ## Working Memory

    <!-- OMCS:NOTEPAD:WORKING -->
    2026-05-20T15:00:00Z added validate-notepad-format
    2026-05-20T15:30:00Z added pytest coverage
    <!-- /OMCS:NOTEPAD:WORKING -->

    ## MANUAL

    <!-- OMCS:NOTEPAD:MANUAL -->
    Never edit workflow-state.json by hand.
    <!-- /OMCS:NOTEPAD:MANUAL -->
    """
).strip() + "\n"


_BAD_MISSING_HEADER = _CLEAN_FIXTURE.replace("## Priority Context", "## Priorities")
_BAD_OVERSIZED_PRIORITY = _CLEAN_FIXTURE.replace(
    "Working on the memory layer refactor; bridge tools optional.",
    "x" * (PRIORITY_CAP + 1),
)
_BAD_UNTIMESTAMPED_WORKING = _CLEAN_FIXTURE.replace(
    "2026-05-20T15:00:00Z added validate-notepad-format",
    "added validate-notepad-format (no timestamp)",
)
_BAD_NONMONOTONIC_WORKING = _CLEAN_FIXTURE.replace(
    "2026-05-20T15:00:00Z added validate-notepad-format\n"
    "2026-05-20T15:30:00Z added pytest coverage",
    "2026-05-20T15:30:00Z added pytest coverage\n"
    "2026-05-20T15:00:00Z added validate-notepad-format",
)
assert "2026-05-20T15:30:00Z added pytest coverage\n2026-05-20T15:00:00Z added validate-notepad-format" in _BAD_NONMONOTONIC_WORKING, (
    "self-test fixture substitution did not land; check whitespace"
)


def _run_self_test() -> int:
    with tempfile.TemporaryDirectory() as td:
        sandbox = Path(td)
        clean = sandbox / "notepad-clean.md"
        clean.write_text(_CLEAN_FIXTURE, encoding="utf-8")
        validate(clean)

        cases = (
            ("missing-header", _BAD_MISSING_HEADER, "missing required header"),
            ("oversized-priority", _BAD_OVERSIZED_PRIORITY, "Priority Context exceeds"),
            ("untimestamped-working", _BAD_UNTIMESTAMPED_WORKING, "does not start with an ISO 8601"),
            ("nonmonotonic-working", _BAD_NONMONOTONIC_WORKING, "not sorted non-decreasing"),
        )
        for name, fixture, expected_substr in cases:
            bad = sandbox / f"notepad-{name}.md"
            bad.write_text(fixture, encoding="utf-8")
            try:
                validate(bad)
            except SystemExit as exc:
                if exc.code != 1:
                    print(
                        f"FAIL: self-test {name}: expected SystemExit(1), got SystemExit({exc.code})",
                        file=sys.stderr,
                    )
                    return 1
                _ok(f"self-test detected {name}")
            else:
                print(f"FAIL: self-test {name}: validator did not detect the problem", file=sys.stderr)
                return 1

    if TEMPLATE_PATH.is_file():
        validate(TEMPLATE_PATH)
        _ok(f"shipped template passes: {TEMPLATE_PATH.relative_to(ROOT)}")
    else:
        print(f"FAIL: shipped template missing: {TEMPLATE_PATH}", file=sys.stderr)
        return 1

    print("VALIDATE_NOTEPAD_FORMAT_SELF_TEST_OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--self-test" in args:
        return _run_self_test()
    target = Path(args[0]) if args else TEMPLATE_PATH
    validate(target)
    print("VALIDATE_NOTEPAD_FORMAT_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
