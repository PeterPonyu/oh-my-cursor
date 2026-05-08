#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def count_markdown_files(root: Path) -> int:
    return sum(1 for path in root.rglob("*.md") if path.is_file())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Count .md files recursively in a directory."
    )
    parser.add_argument("directory", help="Directory to scan")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    target = Path(args.directory).expanduser().resolve()

    if not target.exists():
        print(f"error: directory does not exist: {target}", file=sys.stderr)
        return 1
    if not target.is_dir():
        print(f"error: path is not a directory: {target}", file=sys.stderr)
        return 1

    print(count_markdown_files(target))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
