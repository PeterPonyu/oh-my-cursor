#!/usr/bin/env python3
"""Validate that every AC-NNN referenced in the consensus plan is mapped in the PRD.

AC-305: every shipped AC must have a row in `docs/PRD.yaml` under
``mcp_acceptance_criteria``.  This script greps AC IDs out of the plan
markdown, reads the PRD's mapping (a small YAML dict), and asserts every
plan AC ID has a matching key.  It also confirms every PRD row points at
a known AC ID (no orphan rows).

Stdlib-only YAML parser: ``mcp_acceptance_criteria`` lives at the bottom
of ``docs/PRD.yaml`` as a flat mapping of ``AC-NNN: { phase, status,
summary }`` rows; we parse only that block by line scan, no PyYAML
dependency.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "docs" / "plans" / "mcp-state-bridge-2026-05" / "consensus-plan.md"
PRD_PATH = ROOT / "docs" / "PRD.yaml"

AC_RE = re.compile(r"\bAC-\d{3}\b")
PRD_ROW_RE = re.compile(r"^\s{2}(AC-\d{3})\s*:\s*\{")


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def ok(message: str) -> None:
    print(f"ok: {message}")


def _plan_ac_ids() -> set[str]:
    if not PLAN_PATH.is_file():
        fail(f"consensus plan not found: {PLAN_PATH}")
    return set(AC_RE.findall(PLAN_PATH.read_text(encoding="utf-8")))


def _prd_ac_ids() -> set[str]:
    if not PRD_PATH.is_file():
        fail(f"PRD not found: {PRD_PATH}")
    in_block = False
    seen: set[str] = set()
    for raw in PRD_PATH.read_text(encoding="utf-8").splitlines():
        if raw.strip() == "mcp_acceptance_criteria:":
            in_block = True
            continue
        if not in_block:
            continue
        if raw and not raw.startswith(" ") and not raw.startswith("#"):
            # Block ended (next top-level key).
            break
        match = PRD_ROW_RE.match(raw)
        if match:
            seen.add(match.group(1))
    return seen


def main() -> int:
    plan = _plan_ac_ids()
    prd = _prd_ac_ids()

    if not plan:
        fail("no AC-NNN identifiers found in consensus plan")
    if not prd:
        fail(
            "no AC-NNN rows found in PRD.yaml under mcp_acceptance_criteria; "
            "expected '  AC-NNN: { phase: ..., status: ..., summary: ... }'"
        )

    missing_in_prd = sorted(plan - prd)
    if missing_in_prd:
        fail(
            "plan AC IDs missing from docs/PRD.yaml#mcp_acceptance_criteria: "
            + ", ".join(missing_in_prd)
        )

    orphan_in_prd = sorted(prd - plan)
    if orphan_in_prd:
        fail(
            "PRD.yaml#mcp_acceptance_criteria has rows not referenced in the "
            "consensus plan: " + ", ".join(orphan_in_prd)
        )

    ok(f"plan AC IDs ({len(plan)}) all mapped in PRD.yaml; no orphans")
    print("PRD_AC_MAPPING_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
