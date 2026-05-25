#!/usr/bin/env python3
"""Validate that every shipped memory template passes its own validator.

Usage:
  python3 scripts/validate-memory-templates.py
  python3 scripts/validate-memory-templates.py --self-test

This is a thin meta-validator: it walks docs/templates/, picks the right
per-surface validator for each file, and exits non-zero if any template
fails. It exists so a single ``scripts/verify-backbone.sh`` step can
assert "all memory templates are shippable" without callers needing to
remember every per-surface validator name.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_DIR = ROOT / "docs" / "templates"

TEMPLATE_MAP = {
    "notepad.md": ROOT / "scripts" / "validate-notepad-format.py",
    "project-memory.json": ROOT / "scripts" / "validate-project-memory.py",
    "decision.md": ROOT / "scripts" / "validate-decisions-format.py",
}

# Wiki templates: there is no single "wiki" file, only three pieces; the
# wiki structure validator self-tests them collectively.
WIKI_TEMPLATE_FILES = (
    "wiki-index.md",
    "wiki-page.md",
    "wiki-log.md",
)


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _ok(message: str) -> None:
    print(f"ok: {message}")


def _run_validator(script: Path, target: Path) -> None:
    result = subprocess.run(
        [sys.executable, str(script), str(target)],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, file=sys.stderr, end="")
        _fail(f"{script.name} rejected {target.relative_to(ROOT)}")
    _ok(f"{script.name} accepted {target.relative_to(ROOT)}")


def run() -> int:
    if not TEMPLATES_DIR.is_dir():
        _fail(f"templates directory missing: {TEMPLATES_DIR}")

    for filename, validator in TEMPLATE_MAP.items():
        template = TEMPLATES_DIR / filename
        if not template.is_file():
            _fail(f"shipped template missing: {template.relative_to(ROOT)}")
        if not validator.is_file():
            _fail(f"matching validator missing: {validator.relative_to(ROOT)}")
        _run_validator(validator, template)

    for filename in WIKI_TEMPLATE_FILES:
        template = TEMPLATES_DIR / filename
        if not template.is_file():
            _fail(f"shipped wiki template missing: {template.relative_to(ROOT)}")
        _ok(f"shipped wiki template present: {template.relative_to(ROOT)}")

    # The wiki structure validator covers wiki templates collectively via
    # --self-test, which we invoke here as part of the meta-check.
    wiki_validator = ROOT / "scripts" / "validate-wiki-structure.py"
    if not wiki_validator.is_file():
        _fail(f"matching validator missing: {wiki_validator.relative_to(ROOT)}")
    result = subprocess.run(
        [sys.executable, str(wiki_validator), "--self-test"],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, file=sys.stderr, end="")
        _fail("wiki structure validator self-test failed")
    _ok("wiki structure validator self-test passed")

    print("VALIDATE_MEMORY_TEMPLATES_OK")
    return 0


def _run_self_test() -> int:
    # The meta-validator's self-test simply invokes the normal run; if any
    # per-surface validator is missing or any template is missing, the
    # default run path already reports it with a clear cite. We re-emit a
    # dedicated tag so callers can grep for it.
    rc = run()
    if rc == 0:
        print("VALIDATE_MEMORY_TEMPLATES_SELF_TEST_OK")
    return rc


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--self-test" in args:
        return _run_self_test()
    return run()


if __name__ == "__main__":
    raise SystemExit(main())
