#!/usr/bin/env python3
"""Validate decision-record files (ADRs) under docs/decisions/.

Usage:
  python3 scripts/validate-decisions-format.py [path-or-dir]
  python3 scripts/validate-decisions-format.py --self-test

Each ADR is a markdown file at ``docs/decisions/YYYYMMDD-<slug>.md`` with
the frontmatter shown in ``docs/templates/decision.md``:

  ---
  id: YYYYMMDD-short-slug
  title: One-line decision title
  status: proposed|accepted|rejected|deprecated|superseded
  date: YYYY-MM-DD
  supersedes: ""
  superseded_by: ""
  tags: []
  ---

Requirements:

  - filename matches ``id`` (without the ``.md`` extension)
  - filename starts with an ISO 8601 date (8 digits)
  - status is one of the five allowed values
  - if status == "superseded", ``superseded_by`` must be non-empty
  - the body contains Context / Decision / Consequences / Evidence headings

``--self-test`` mode is fully sandboxed under ``tempfile.TemporaryDirectory``.
"""
from __future__ import annotations

import re
import sys
import tempfile
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = ROOT / "docs" / "templates" / "decision.md"
ALLOWED_STATUS = {"proposed", "accepted", "rejected", "deprecated", "superseded"}
REQUIRED_HEADINGS = ("## Context", "## Decision", "## Consequences", "## Evidence")

FRONTMATTER_RE = re.compile(r"^---\n(?P<body>.*?)\n---\n", re.DOTALL)
FILENAME_RE = re.compile(r"^(\d{8})-([a-z0-9][a-z0-9-]*)\.md$")


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _ok(message: str) -> None:
    print(f"ok: {message}")


def _parse_simple_frontmatter(text: str) -> dict[str, str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        _fail("decision file missing YAML frontmatter")
    fields: dict[str, str] = {}
    for raw in m.group("body").splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            _fail(f"frontmatter line missing ':': {stripped[:120]}")
        key, _, value = stripped.partition(":")
        fields[key.strip()] = value.strip().strip('"').strip("'")
    return fields


def _validate_file(path: Path) -> None:
    fn_match = FILENAME_RE.match(path.name)
    if not fn_match:
        _fail(f"decision filename must be YYYYMMDD-<slug>.md: {path.name}")
    expected_id = f"{fn_match.group(1)}-{fn_match.group(2)}"

    text = path.read_text(encoding="utf-8")
    fields = _parse_simple_frontmatter(text)

    for required in ("id", "title", "status", "date", "supersedes", "superseded_by", "tags"):
        if required not in fields:
            _fail(f"{path.name} frontmatter missing required key: {required}")

    if fields["id"] != expected_id:
        _fail(
            f"{path.name} frontmatter id={fields['id']!r} does not match filename id {expected_id!r}"
        )

    if fields["status"] not in ALLOWED_STATUS:
        _fail(
            f"{path.name} status={fields['status']!r} not in {sorted(ALLOWED_STATUS)}"
        )

    if fields["status"] == "superseded" and not fields["superseded_by"]:
        _fail(f"{path.name} is superseded but superseded_by is empty")

    if not re.match(r"^\d{4}-\d{2}-\d{2}$", fields["date"]):
        _fail(f"{path.name} date={fields['date']!r} must be ISO 8601 YYYY-MM-DD")

    for heading in REQUIRED_HEADINGS:
        if heading not in text:
            _fail(f"{path.name} body missing required heading: {heading}")


def _is_template_filename(name: str) -> bool:
    """Templates use placeholder filenames; only validate the body when invoked
    on the template directly."""
    return name == "decision.md"


def _validate_template(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    fields = _parse_simple_frontmatter(text)
    required = {"id", "title", "status", "date", "supersedes", "superseded_by", "tags"}
    missing = required - set(fields)
    if missing:
        _fail(f"template missing frontmatter keys: {sorted(missing)}")
    for heading in REQUIRED_HEADINGS:
        if heading not in text:
            _fail(f"template body missing required heading: {heading}")


def validate(target: Path) -> None:
    if target.is_dir():
        files = sorted(p for p in target.glob("*.md") if not _is_template_filename(p.name))
        if not files:
            _ok(f"no decision files in {target}; nothing to validate")
            return
        for path in files:
            _validate_file(path)
        _ok(f"validated {len(files)} decision file(s) in {target}")
        return
    if not target.is_file():
        _fail(f"decision file not found: {target}")
    if _is_template_filename(target.name):
        _validate_template(target)
        _ok(f"decision template is valid: {target}")
        return
    _validate_file(target)
    _ok(f"decision file is valid: {target}")


# ---------------------------------------------------------------------------
# --self-test
# ---------------------------------------------------------------------------


_CLEAN_FIXTURE = textwrap.dedent(
    """
    ---
    id: 20260520-memory-layer-design
    title: Adopt three-section notepad and append-only wiki
    status: accepted
    date: 2026-05-20
    supersedes: ""
    superseded_by: ""
    tags: [memory, design]
    ---

    # 20260520-memory-layer-design: Adopt three-section notepad and append-only wiki

    ## Context
    Repo lacked a memory layer.

    ## Decision
    Adopt the OMC-derived three-section notepad and a flat wiki under docs/wiki/.

    ## Consequences
    Plugin payload grows by ~10 KiB of templates; validators add ~600 LoC.

    ## Evidence
    See PR #N.
    """
).strip() + "\n"


def _run_self_test() -> int:
    with tempfile.TemporaryDirectory() as td:
        sandbox = Path(td)
        decisions = sandbox / "decisions"
        decisions.mkdir()
        clean = decisions / "20260520-memory-layer-design.md"
        clean.write_text(_CLEAN_FIXTURE, encoding="utf-8")
        validate(clean)

        bad_filename = decisions / "memory-layer.md"
        bad_filename.write_text(_CLEAN_FIXTURE, encoding="utf-8")
        try:
            validate(bad_filename)
        except SystemExit as exc:
            if exc.code != 1:
                return 1
            _ok("self-test detected bad-filename")
        else:
            print("FAIL: bad-filename not detected", file=sys.stderr)
            return 1
        bad_filename.unlink()

        bad_status = decisions / "20260520-bad-status.md"
        bad_status.write_text(
            _CLEAN_FIXTURE.replace(
                "id: 20260520-memory-layer-design",
                "id: 20260520-bad-status",
            ).replace("status: accepted", "status: maybe"),
            encoding="utf-8",
        )
        try:
            validate(bad_status)
        except SystemExit as exc:
            if exc.code != 1:
                return 1
            _ok("self-test detected bad-status")
        else:
            print("FAIL: bad-status not detected", file=sys.stderr)
            return 1
        bad_status.unlink()

        superseded_orphan = decisions / "20260520-orphaned.md"
        superseded_orphan.write_text(
            _CLEAN_FIXTURE.replace(
                "id: 20260520-memory-layer-design",
                "id: 20260520-orphaned",
            ).replace("status: accepted", "status: superseded"),
            encoding="utf-8",
        )
        try:
            validate(superseded_orphan)
        except SystemExit as exc:
            if exc.code != 1:
                return 1
            _ok("self-test detected superseded-without-superseded_by")
        else:
            print("FAIL: superseded-without-superseded_by not detected", file=sys.stderr)
            return 1
        superseded_orphan.unlink()

    if TEMPLATE_PATH.is_file():
        validate(TEMPLATE_PATH)
        _ok(f"shipped template passes: {TEMPLATE_PATH.relative_to(ROOT)}")
    else:
        print(f"FAIL: shipped template missing: {TEMPLATE_PATH}", file=sys.stderr)
        return 1

    print("VALIDATE_DECISIONS_FORMAT_SELF_TEST_OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--self-test" in args:
        return _run_self_test()
    target = Path(args[0]) if args else (ROOT / "docs" / "decisions")
    if not target.exists():
        if TEMPLATE_PATH.is_file():
            validate(TEMPLATE_PATH)
        else:
            _fail(f"no decisions dir at {target} and shipped template missing: {TEMPLATE_PATH}")
        print("VALIDATE_DECISIONS_FORMAT_OK")
        return 0
    validate(target)
    print("VALIDATE_DECISIONS_FORMAT_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
