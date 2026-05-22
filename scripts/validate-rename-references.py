#!/usr/bin/env python3
"""Validate that grep references for the workflow-state helper match the checked-in fixture.

Exits 0 and prints RENAME_REFERENCES_OK when the grep output exactly matches
the fixture content in docs/plans/mcp-state-bridge-2026-05/expected-rename-references.txt.

Exits non-zero with a unified diff and RENAME_REFERENCES_DRIFT message on mismatch.

Stdlib only.
"""
from __future__ import annotations

import difflib
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "docs" / "plans" / "mcp-state-bridge-2026-05" / "expected-rename-references.txt"


def fail(msg: str) -> NoReturn:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


if not FIXTURE.is_file():
    fail(f"fixture not found: {FIXTURE.relative_to(ROOT)}")

def _normalize(line: str) -> str:
    """Strip leading './' and drop the line-number component (file:N:content -> file::content).

    The fixture was generated at a point-in-time snapshot; line numbers shift as
    surrounding code is edited. Comparing file+content (without line numbers) keeps
    the validator useful without requiring constant fixture regeneration.
    """
    line = line[2:] if line.startswith("./") else line
    # file:lineno:rest  ->  file::rest  (collapse the numeric field)
    import re as _re
    return _re.sub(r'^([^:]+):\d+:', r'\1::', line, count=1)

fixture_lines = sorted(_normalize(line) for line in FIXTURE.read_text(encoding="utf-8").splitlines(keepends=True))

try:
    result = subprocess.check_output(
        [
            "grep",
            "-RIn",
            "workflow-state\\.py",
            "--include=*.py",
            "--include=*.sh",
            "--include=*.md",
            "--include=*.mdc",
            "--include=*.yaml",
            "--exclude-dir=.git",
            "--exclude-dir=.omcs",
            "--exclude-dir=.omc",
            "--exclude-dir=.cursor-worktree",
            "--exclude-dir=dist",
            "--exclude-dir=benchmark/runs/data",
            "--exclude-dir=docs/plans",
            ".",
        ],
        cwd=str(ROOT),
        stderr=subprocess.DEVNULL,
    )
    grep_text = result.decode("utf-8", errors="replace")
except subprocess.CalledProcessError as exc:
    if exc.returncode == 1:
        # grep returns 1 when no matches found
        grep_text = ""
    else:
        fail(f"grep failed with exit code {exc.returncode}")

actual_lines = sorted(_normalize(line) for line in grep_text.splitlines(keepends=True))

if actual_lines == fixture_lines:
    print("RENAME_REFERENCES_OK")
    sys.exit(0)

# Produce unified diff
diff = list(
    difflib.unified_diff(
        fixture_lines,
        actual_lines,
        fromfile="expected-rename-references.txt (fixture)",
        tofile="grep output (actual)",
    )
)

print("".join(diff), end="")
print(
    "RENAME_REFERENCES_DRIFT: fixture out of date, regenerate or coordinate the rename",
    file=sys.stderr,
)
sys.exit(1)
