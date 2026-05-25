#!/usr/bin/env python3
"""Validate a wiki directory against the repo contract.

Usage:
  python3 scripts/validate-wiki-structure.py [wiki-dir]
  python3 scripts/validate-wiki-structure.py --self-test

The wiki contract:

  - <dir>/index.md exists
  - <dir>/log.md exists and is sorted by timestamp non-decreasing
  - each <dir>/<slug>.md (other than index.md, log.md) has the YAML
    frontmatter shown in docs/templates/wiki-page.md and is <= 10 KiB
  - the optional <dir>/archive/ directory is not validated for size

``--self-test`` mode runs everything under ``tempfile.TemporaryDirectory``;
it never mutates the working tree.
"""
from __future__ import annotations

import re
import sys
import tempfile
import textwrap
from pathlib import Path
from typing import NoReturn


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_INDEX = ROOT / "docs" / "templates" / "wiki-index.md"
TEMPLATE_PAGE = ROOT / "docs" / "templates" / "wiki-page.md"
TEMPLATE_LOG = ROOT / "docs" / "templates" / "wiki-log.md"

MAX_PAGE_BYTES = 10 * 1024  # 10 KiB

LOG_ENTRY_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+"
    r"(?P<action>add|update|archive)\s+"
    r"(?P<slug>[a-z0-9][a-z0-9-]*)\s+"
    r"\S.*$"
)

FRONTMATTER_RE = re.compile(r"^---\n(?P<body>.*?)\n---\n", re.DOTALL)
REQUIRED_PAGE_KEYS = {"slug", "title", "created", "updated", "tags"}


def _fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _ok(message: str) -> None:
    print(f"ok: {message}")


def _parse_simple_frontmatter(text: str) -> dict[str, str] | None:
    """Parse a small flat YAML-ish frontmatter block (one key per line).

    The validators avoid pyyaml so we only parse the subset our templates
    actually use: `key: value` per line, plus `key: []` arrays which we
    record as the literal string "[]".  Anything more complex than that
    is rejected because our templates do not need it.
    """
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None
    fields: dict[str, str] = {}
    for raw in m.group("body").splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            _fail(f"frontmatter line missing ':' separator: {stripped[:120]}")
        key, _, value = stripped.partition(":")
        fields[key.strip()] = value.strip()
    return fields


def _validate_index(path: Path) -> None:
    if not path.is_file():
        _fail(f"wiki index missing: {path}")
    text = path.read_text(encoding="utf-8")
    if "# Wiki index" not in text and "## Pages" not in text:
        _fail("wiki index must contain a '# Wiki index' heading and a '## Pages' section")


def _validate_log(path: Path) -> None:
    if not path.is_file():
        _fail(f"wiki log missing: {path}")
    text = path.read_text(encoding="utf-8")
    entries: list[str] = []
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("<!--"):
            continue
        if stripped.startswith("```") or stripped == "Format":
            continue
        if stripped.startswith("YYYY-MM-DDTHH"):
            # The template shows the format inside a fenced code block; skip
            continue
        m = LOG_ENTRY_RE.match(stripped)
        if not m:
            _fail(f"wiki log entry does not match contract: {stripped[:120]}")
        entries.append(m.group("ts"))
    if entries != sorted(entries):
        _fail("wiki log entries are not sorted non-decreasing by timestamp")


def _validate_page(path: Path) -> None:
    size = path.stat().st_size
    if size > MAX_PAGE_BYTES:
        _fail(f"wiki page {path.name} is {size} bytes; cap is {MAX_PAGE_BYTES}")
    text = path.read_text(encoding="utf-8")
    fields = _parse_simple_frontmatter(text)
    if fields is None:
        _fail(f"wiki page {path.name} missing frontmatter")
    missing = REQUIRED_PAGE_KEYS - set(fields)
    if missing:
        _fail(f"wiki page {path.name} missing frontmatter keys: {sorted(missing)}")


def validate(wiki_dir: Path) -> None:
    if not wiki_dir.is_dir():
        _fail(f"wiki directory not found: {wiki_dir}")
    _validate_index(wiki_dir / "index.md")
    _validate_log(wiki_dir / "log.md")
    pages = sorted(p for p in wiki_dir.glob("*.md") if p.name not in {"index.md", "log.md"})
    for page in pages:
        _validate_page(page)
    _ok(f"wiki structure is valid ({len(pages)} page{'s' if len(pages) != 1 else ''}): {wiki_dir}")


# ---------------------------------------------------------------------------
# --self-test
# ---------------------------------------------------------------------------


_CLEAN_INDEX = textwrap.dedent(
    """
    # Wiki index

    ## Sections

    - Architecture

    ## Pages

    - [[architecture-overview]]
    """
).strip() + "\n"


_CLEAN_LOG = textwrap.dedent(
    """
    # Wiki log

    2026-05-20T15:00:00Z  add     architecture-overview  initial draft
    2026-05-20T16:00:00Z  update  architecture-overview  add module map
    """
).strip() + "\n"


_CLEAN_PAGE = textwrap.dedent(
    """
    ---
    slug: architecture-overview
    title: Architecture overview
    created: 2026-05-20
    updated: 2026-05-20
    tags: []
    ---

    # Architecture overview

    ## Summary

    One paragraph.
    """
).strip() + "\n"


def _seed_clean_wiki(root: Path) -> Path:
    wiki = root / "wiki"
    wiki.mkdir()
    (wiki / "index.md").write_text(_CLEAN_INDEX, encoding="utf-8")
    (wiki / "log.md").write_text(_CLEAN_LOG, encoding="utf-8")
    (wiki / "architecture-overview.md").write_text(_CLEAN_PAGE, encoding="utf-8")
    return wiki


def _expect_fail(label: str, fn) -> int:
    try:
        fn()
    except SystemExit as exc:
        if exc.code != 1:
            print(f"FAIL: self-test {label}: expected SystemExit(1), got {exc.code}", file=sys.stderr)
            return 1
        _ok(f"self-test detected {label}")
        return 0
    print(f"FAIL: self-test {label}: validator did not detect the problem", file=sys.stderr)
    return 1


def _run_self_test() -> int:
    with tempfile.TemporaryDirectory() as td:
        sandbox = Path(td)
        wiki = _seed_clean_wiki(sandbox)
        validate(wiki)
        _ok("self-test clean wiki passes")

    with tempfile.TemporaryDirectory() as td:
        sandbox = Path(td)
        wiki = _seed_clean_wiki(sandbox)
        (wiki / "log.md").write_text(
            "2026-05-20T16:00:00Z  update  architecture-overview  out of order\n"
            "2026-05-20T15:00:00Z  add     architecture-overview  initial\n",
            encoding="utf-8",
        )
        rc = _expect_fail("log-out-of-order", lambda: validate(wiki))
        if rc != 0:
            return rc

    with tempfile.TemporaryDirectory() as td:
        sandbox = Path(td)
        wiki = _seed_clean_wiki(sandbox)
        (wiki / "no-frontmatter.md").write_text("# Body only\n", encoding="utf-8")
        rc = _expect_fail("page-missing-frontmatter", lambda: validate(wiki))
        if rc != 0:
            return rc

    with tempfile.TemporaryDirectory() as td:
        sandbox = Path(td)
        wiki = _seed_clean_wiki(sandbox)
        big = _CLEAN_PAGE.replace(
            "One paragraph.",
            "x" * (MAX_PAGE_BYTES + 1024),
        )
        (wiki / "oversized.md").write_text(big, encoding="utf-8")
        rc = _expect_fail("page-too-large", lambda: validate(wiki))
        if rc != 0:
            return rc

    # The shipped templates are individual files, not a wiki; smoke-check
    # they parse with the same helpers they exist to seed.
    for path in (TEMPLATE_INDEX, TEMPLATE_PAGE, TEMPLATE_LOG):
        if not path.is_file():
            print(f"FAIL: shipped template missing: {path}", file=sys.stderr)
            return 1
        _ok(f"shipped template present: {path.relative_to(ROOT)}")

    page_fields = _parse_simple_frontmatter(TEMPLATE_PAGE.read_text(encoding="utf-8"))
    if page_fields is None or not REQUIRED_PAGE_KEYS.issubset(page_fields):
        print(
            "FAIL: shipped wiki-page template missing required frontmatter keys",
            file=sys.stderr,
        )
        return 1
    _ok("shipped wiki-page template has all required frontmatter keys")

    print("VALIDATE_WIKI_STRUCTURE_SELF_TEST_OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--self-test" in args:
        return _run_self_test()
    target = Path(args[0]) if args else (ROOT / "docs" / "wiki")
    if not target.exists():
        # No live wiki; degrade to template smoke check rather than a hard fail.
        for path in (TEMPLATE_INDEX, TEMPLATE_PAGE, TEMPLATE_LOG):
            if not path.is_file():
                _fail(f"no wiki at {target} and shipped template missing: {path}")
        _ok(f"no wiki at {target}; shipped templates present")
        print("VALIDATE_WIKI_STRUCTURE_OK")
        return 0
    validate(target)
    print("VALIDATE_WIKI_STRUCTURE_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
