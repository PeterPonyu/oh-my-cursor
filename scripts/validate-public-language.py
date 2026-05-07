#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

PUBLIC_ROOT_FILES = ["AGENTS.md", "README.md", "CHANGELOG.md"]
PUBLIC_DIRS = ["docs", "rules", "skills", ".cursor/rules"]
PUBLIC_SUFFIXES = {".md", ".mdc", ".markdown", ".yaml", ".yml"}
APP_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".md"}

EXCLUDED_PREFIXES = (
    "benchmark/results/",
    "benchmark/runs/data/",
    "benchmark/runs/stale-runs-",
    "apps/cursor-backbone-site/.next/",
    "apps/cursor-backbone-site/out/",
    "node_modules/",
)

# Self-referential heritage tokens (`omc`, `oh-my-claudecode`, `Claude
# Code`, `migration from`, `adaptation`) appear legitimately across this
# repo's own docs (notably `docs/state-boundaries.md`, which has to name
# `.omc/state` to document the ownership boundary against the upstream
# OMC harness). They were pruned to match the post-Stage-3 claim-guard
# pattern set; only genuinely external references remain forbidden.
FORBIDDEN_PATTERNS = {
    "legacy-short-name-b": re.compile(r"(?<![A-Za-z0-9])omx(?![A-Za-z0-9])", re.IGNORECASE),
    "legacy-package-b": re.compile(r"oh-my-codex", re.IGNORECASE),
    "source-system": re.compile(r"source[ -]system", re.IGNORECASE),
    "comparison-clone": re.compile(r"parity clone", re.IGNORECASE),
    "legacy-arm": re.compile(r"with-omc", re.IGNORECASE),
    "external-source": re.compile(r"external[ -]source", re.IGNORECASE),
}


def _is_excluded(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    return any(rel.startswith(prefix) for prefix in EXCLUDED_PREFIXES)


def _iter_public_files() -> list[Path]:
    files: set[Path] = set()
    for name in PUBLIC_ROOT_FILES:
        path = ROOT / name
        if path.is_file():
            files.add(path)

    for dirname in PUBLIC_DIRS:
        base = ROOT / dirname
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix in PUBLIC_SUFFIXES and not _is_excluded(path):
                files.add(path)

    app_base = ROOT / "apps" / "cursor-backbone-site" / "app"
    if app_base.exists():
        for path in app_base.rglob("*"):
            if path.is_file() and path.suffix in APP_SUFFIXES and not _is_excluded(path):
                files.add(path)

    benchmark_base = ROOT / "benchmark"
    if benchmark_base.exists():
        for path in benchmark_base.rglob("*.md"):
            if path.is_file() and not _is_excluded(path):
                files.add(path)

    return sorted(files)


def main() -> int:
    violations: list[str] = []
    for path in _iter_public_files():
        rel = path.relative_to(ROOT)
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for line_no, line in enumerate(lines, start=1):
            for label, pattern in FORBIDDEN_PATTERNS.items():
                if pattern.search(line):
                    violations.append(f"{rel}:{line_no}: {label}")

    if violations:
        print("PUBLIC_LANGUAGE_FAIL", file=sys.stderr)
        for violation in violations:
            print(violation, file=sys.stderr)
        return 1

    print("PUBLIC_LANGUAGE_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())