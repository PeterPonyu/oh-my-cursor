#!/usr/bin/env python3
"""Count markdown (`*.md`) files under a directory.

Python port of `scripts/count_md_files.ts`, kept in sync byte-for-byte
semantics: recursive walk, count files whose name ends in `.md`, print the
integer count on stdout. Used by the Python CI workflow's
"Docs scan baseline" step.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def count_markdown_files(root: Path) -> int:
    count = 0
    for _dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if name.endswith(".md"):
                count += 1
    return count


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(
            "Usage: python3 scripts/count_md_files.py <directory>",
            file=sys.stderr,
        )
        return 1
    target = Path(argv[0]).resolve()
    if not target.exists():
        print(f"error: directory does not exist: {target}", file=sys.stderr)
        return 1
    if not target.is_dir():
        print(f"error: path is not a directory: {target}", file=sys.stderr)
        return 1
    print(count_markdown_files(target))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
