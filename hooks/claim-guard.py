#!/usr/bin/env python3
"""afterFileEdit hook: guard public claim/proof wording.

Replaces the older `claim-proof-audit.py` with a brief, lifecycle-style name.
Behavior is unchanged: scan edited public files for legacy comparison wording
and severe unsupported runtime claims, fail-open on warnings, and only block
on severe overclaims.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _repo import resolve_workspace_root  # noqa: E402
from _trace import trace as _trace  # noqa: E402

ROOT = resolve_workspace_root(__file__)

PUBLIC_ROOT_FILES = {"AGENTS.md", "README.md", "CHANGELOG.md"}
PUBLIC_PREFIXES = (
    "docs/",
    "rules/",
    "skills/",
    ".cursor/rules/",
    "apps/cursor-backbone-site/app/",
    "benchmark/",
)
EXCLUDED_PREFIXES = (
    "benchmark/results/",
    "benchmark/runs/data/",
    "benchmark/runs/stale-runs-",
    "apps/cursor-backbone-site/.next/",
    "apps/cursor-backbone-site/out/",
)
PUBLIC_SUFFIXES = {".md", ".mdc", ".markdown", ".yaml", ".yml", ".tsx", ".ts", ".jsx", ".js"}

LANGUAGE_PATTERNS = {
    # Self-referential heritage tokens (`omc`, `oh-my-claudecode`, `Claude
    # Code`, `migration from`, `adaptation`) appear legitimately across this
    # repo's docs and were pruned from the warning surface to reduce noise.
    # The blocking surface is `SEVERE_OVERCLAIMS` below; only the tokens
    # below remain as fail-open warnings for genuinely external references.
    "legacy-short-name-b": re.compile(r"(?<![A-Za-z0-9])omx(?![A-Za-z0-9])", re.IGNORECASE),
    "legacy-package-b": re.compile(r"oh-my-codex", re.IGNORECASE),
    "source-system": re.compile(r"source[ -]system", re.IGNORECASE),
    "comparison-clone": re.compile(r"parity clone", re.IGNORECASE),
    "legacy-arm": re.compile(r"(?<!-)with-omc\b", re.IGNORECASE),
    "external-source": re.compile(r"external[ -]source", re.IGNORECASE),
}

SEVERE_OVERCLAIMS = {
    "default-mcp": re.compile(r"repo[- ]owned.{0,80}(?:\.cursor/mcp\.json|mcp config)", re.IGNORECASE),
    "marketplace-publication": re.compile(r"marketplace publication.{0,80}(?:required|shipped|complete|repo[- ]owned)", re.IGNORECASE),
    "repo-file-modes": re.compile(r"repo[- ]file.{0,60}custom modes?", re.IGNORECASE),
    "repo-file-background-agents": re.compile(r"repo[- ]file.{0,60}background[- ]agents?", re.IGNORECASE),
}

SEVERE_NEGATIONS = (
    "does not claim",
    "do not claim",
    "not claim",
    "remain outside",
    "outside the current",
    "until",
    "unless",
)


def _read_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {"_invalid_json": True}
    return value if isinstance(value, dict) else {"payload": value}


def _path_from_uri(value: str) -> str | None:
    if not value.startswith("file:"):
        return value
    parsed = urlparse(value)
    if parsed.scheme != "file":
        return None
    return unquote(parsed.path)


def _collect_paths(value) -> list[str]:
    paths: list[str] = []
    if isinstance(value, dict):
        for key, nested in value.items():
            lowered = key.lower()
            if lowered in {"path", "filepath", "file", "uri"} and isinstance(nested, str):
                parsed = _path_from_uri(nested)
                if parsed:
                    paths.append(parsed)
            elif lowered in {"paths", "files", "edited_files", "editedfiles", "changed_files", "changedfiles"}:
                paths.extend(_collect_paths(nested))
            else:
                paths.extend(_collect_paths(nested))
    elif isinstance(value, list):
        for item in value:
            paths.extend(_collect_paths(item))
    elif isinstance(value, str):
        parsed = _path_from_uri(value)
        if parsed and ("/" in parsed or "." in parsed):
            paths.append(parsed)
    return paths


def _relative_path(raw_path: str) -> Path | None:
    candidate = Path(raw_path)
    try:
        full_path = candidate.resolve() if candidate.is_absolute() else (ROOT / candidate).resolve()
        return full_path.relative_to(ROOT)
    except (OSError, RuntimeError, ValueError):
        return None


def _is_public_text(path: Path) -> bool:
    rel = path.as_posix()
    if any(rel.startswith(prefix) for prefix in EXCLUDED_PREFIXES):
        return False
    if path.name.startswith(".") and not rel.startswith(".cursor/rules/"):
        return False
    if path.suffix not in PUBLIC_SUFFIXES:
        return False
    if rel in PUBLIC_ROOT_FILES:
        return True
    if rel.startswith("benchmark/"):
        return path.suffix == ".md" and not rel.startswith("benchmark/results/")
    return any(rel.startswith(prefix) for prefix in PUBLIC_PREFIXES)


def _scan_file(path: Path) -> list[dict[str, object]]:
    try:
        full_path = (ROOT / path).resolve()
        rel_path = full_path.relative_to(ROOT)
    except (OSError, RuntimeError, ValueError):
        return []

    if not full_path.is_file() or not _is_public_text(rel_path):
        return []

    issues: list[dict[str, object]] = []
    try:
        lines = full_path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return []

    for line_no, line in enumerate(lines, start=1):
        for label, pattern in LANGUAGE_PATTERNS.items():
            if pattern.search(line):
                issues.append(
                    {
                        "file": rel_path.as_posix(),
                        "line": line_no,
                        "severity": "warning",
                        "rule": label,
                    }
                )
        lowered_line = line.lower()
        for label, pattern in SEVERE_OVERCLAIMS.items():
            if any(negation in lowered_line for negation in SEVERE_NEGATIONS):
                continue
            if pattern.search(line):
                issues.append(
                    {
                        "file": rel_path.as_posix(),
                        "line": line_no,
                        "severity": "severe",
                        "rule": label,
                    }
                )
    return issues


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({"status": "pass", "fail_open": True, "message": "Hook input was not JSON; skipped audit."}))
        return 0

    rel_paths = []
    seen: set[str] = set()
    for raw_path in _collect_paths(payload):
        rel = _relative_path(raw_path)
        if rel is None:
            continue
        key = rel.as_posix()
        if key not in seen:
            seen.add(key)
            rel_paths.append(rel)

    issues: list[dict[str, object]] = []
    for rel_path in rel_paths:
        issues.extend(_scan_file(rel_path))

    severe_count = sum(1 for issue in issues if issue.get("severity") == "severe")
    warning_count = sum(1 for issue in issues if issue.get("severity") == "warning")
    status = "severe" if severe_count else "warning" if warning_count else "pass"
    output = {
        "status": status,
        "fail_open": severe_count == 0,
        "checked_files": [path.as_posix() for path in rel_paths],
        "warning_count": warning_count,
        "severe_count": severe_count,
        "issues": issues[:50],
    }
    if severe_count:
        output["message"] = "Severe unsupported runtime claim detected; review before continuing."
    elif warning_count:
        output["message"] = "Public wording warning detected; keep product posture artifact-backed."
    else:
        output["message"] = "Claim/proof audit passed."

    _trace({
        "hook": "claim-guard",
        "event": "afterFileEdit",
        "status": status,
        "checked_files": output.get("checked_files", []),
        "warning_count": warning_count,
        "severe_count": severe_count,
    })
    print(json.dumps(output, ensure_ascii=False))
    return 2 if severe_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
