#!/usr/bin/env python3
"""F5 / Phase 8: lock down the agent-callable surface contract.

Mechanically asserts that every agent prompt, skill, and rule file:

1. **Does not invoke the workflow-state writer CLI directly.** The bridge
   tools (`state_init`, `state_set_phase`, ...) are the only sanctioned
   write path for agent-callable code; the CLI shim is developer-only.
   The validator allowlists references to the read-only validator
   ``scripts/validate-workflow-state.py``.

2. **Does not link to archived dev-process docs as if they were the live
   entry path.** ``docs/refinement-priority-map.md``,
   ``docs/plugin-boundary-review.md``, and ``docs/fallback-policy.md``
   moved under ``docs/archive/`` after the README polish; agent prompts
   must use the new paths.

3. **Does not contain legacy short-name leakage.** Reuses the same
   forbidden patterns as ``validate-public-language.py`` so the agent
   surface stays repo-native.

Surfaces scanned (all globs):

- ``.cursor/agents/*.md`` (project agents, repo-owned)
- ``skills/**/SKILL.md`` (plugin-shipped skills)
- ``rules/**/*.mdc`` (plugin-shipped rules)
- ``.cursor/rules/**/*.mdc`` (project rules)

Modes:

- default: scan every surface; exit 0 on a clean tree, 1 on the first
  offender with a precise file:line cite.
- ``--self-test``: seed three synthetic offenders inside a
  ``tempfile.TemporaryDirectory`` (V2 isolation), confirm each is
  detected, and confirm a clean fixture passes. Never mutates the
  working tree.
"""
from __future__ import annotations

import re
import sys
import tempfile
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# Detector patterns
# ---------------------------------------------------------------------------

# 1. Writer-CLI bypass — match either path, but not the read-only validator.
WRITER_PATH_PATTERNS = (
    re.compile(r"\.cursor/state/workflow-state\.py"),
    re.compile(r"scripts/workflow-state\.py"),
)
# Allowlist: read-only validator at scripts/validate-workflow-state.py.
READONLY_VALIDATOR_RE = re.compile(r"validate-workflow-state\.py")


# 2. Archived dev-process doc paths that should now reference docs/archive/.
STALE_ARCHIVED_PATHS = (
    re.compile(r"\bdocs/refinement-priority-map\.md\b"),
    re.compile(r"\bdocs/plugin-boundary-review\.md\b"),
    re.compile(r"\bdocs/fallback-policy\.md\b"),
)


# 3. Legacy short names (subset of validate-public-language patterns; kept
#    here so the agent-surface gate stays self-contained even if the public-
#    language validator is run separately).
LEGACY_SHORT_NAMES = (
    (re.compile(r"(?<![A-Za-z0-9])omc(?![A-Za-z0-9])", re.IGNORECASE), "legacy-short-name-a"),
    (re.compile(r"(?<![A-Za-z0-9])omx(?![A-Za-z0-9])", re.IGNORECASE), "legacy-short-name-b"),
    (re.compile(r"oh-my-claudecode", re.IGNORECASE), "legacy-package-a"),
    (re.compile(r"oh-my-codex", re.IGNORECASE), "legacy-package-b"),
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _ok(message: str) -> None:
    print(f"ok: {message}")


def _agent_callable_files(root: Path) -> list[Path]:
    """Return every file in scope, sorted for deterministic output."""
    files: list[Path] = []
    files.extend(sorted((root / ".cursor" / "agents").glob("*.md")))
    files.extend(sorted((root / "skills").glob("**/SKILL.md")))
    files.extend(sorted((root / "rules").glob("**/*.mdc")))
    files.extend(sorted((root / "rules").glob("**/*.md")))
    files.extend(sorted((root / ".cursor" / "rules").glob("**/*.mdc")))
    files.extend(sorted((root / ".cursor" / "rules").glob("**/*.md")))
    return [f for f in files if f.is_file()]


def _render_path(path: Path) -> str:
    """Render ``path`` relative to repo ROOT when possible; absolute otherwise.

    The default scan always passes paths under ROOT.  The ``--self-test``
    mode passes paths inside a :class:`tempfile.TemporaryDirectory` that
    is *not* under ROOT, so a naive ``relative_to(ROOT)`` would raise
    ``ValueError``.  Both call paths produce the same human-readable
    cite-style output via this helper.
    """
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def scan_file(path: Path) -> list[str]:
    """Return list of offender descriptions; empty if clean."""
    offenders: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        return [f"{path}: read error: {exc}"]

    cite = _render_path(path)
    for line_no, raw in enumerate(text.splitlines(), start=1):
        # 1. Writer-CLI bypass.
        for writer_re in WRITER_PATH_PATTERNS:
            if writer_re.search(raw):
                # Allow the read-only validator -- but only because validators
                # are stand-alone scripts, not the writer CLI.  The two paths
                # have non-overlapping prefixes so a literal substring search
                # is sufficient.
                if READONLY_VALIDATOR_RE.search(raw):
                    continue
                offenders.append(
                    f"{cite}:{line_no} "
                    f"references the workflow-state writer CLI directly: "
                    f"{raw.strip()[:120]}"
                )
                break

        # 2. Stale archived-doc paths.
        for stale_re in STALE_ARCHIVED_PATHS:
            if stale_re.search(raw):
                offenders.append(
                    f"{cite}:{line_no} "
                    f"references archived doc with old path; use docs/archive/: "
                    f"{raw.strip()[:120]}"
                )
                break

        # 3. Legacy short-name leakage.
        for legacy_re, label in LEGACY_SHORT_NAMES:
            if legacy_re.search(raw):
                offenders.append(
                    f"{cite}:{line_no} legacy {label}: "
                    f"{raw.strip()[:120]}"
                )
                break

    return offenders


# ---------------------------------------------------------------------------
# Default scan
# ---------------------------------------------------------------------------


def run_default_scan(root: Path | None = None) -> int:
    root = (root or ROOT).resolve()
    files = _agent_callable_files(root)
    if not files:
        _fail(f"no agent-callable files found under {root}")

    offenders: list[str] = []
    for path in files:
        offenders.extend(scan_file(path))

    if offenders:
        print("FAIL: agent-callable surface contract violated:", file=sys.stderr)
        for line in offenders:
            print(f"  {line}", file=sys.stderr)
        return 1

    _ok(f"scanned {len(files)} agent-callable surfaces; contract clean")
    print("AGENT_BRIDGE_CONTRACT_OK")
    return 0


# ---------------------------------------------------------------------------
# Self-test (V2 tempdir isolation)
# ---------------------------------------------------------------------------


_OFFENDER_BYPASS = textwrap.dedent(
    """
    ---
    name: bad-agent
    ---
    Run `python3 .cursor/state/workflow-state.py init ...` to start.
    """
).strip() + "\n"


_OFFENDER_STALE_PATH = textwrap.dedent(
    """
    ---
    name: stale-link-agent
    ---
    See [`docs/refinement-priority-map.md`](../../docs/refinement-priority-map.md).
    """
).strip() + "\n"


_OFFENDER_LEGACY_NAME = textwrap.dedent(
    """
    ---
    name: legacy-name-agent
    ---
    The omc team will follow this convention.
    """
).strip() + "\n"


_CLEAN_FIXTURE = textwrap.dedent(
    """
    ---
    name: clean-agent
    ---
    Use the cursor-state-bridge MCP tools (`state_init`, `state_set_phase`)
    to write workflow state; never shell out to a writer CLI.  Validate
    on-disk state with `python3 scripts/validate-workflow-state.py <path>`.
    """
).strip() + "\n"


def run_self_test() -> int:
    """Seed offenders + a clean fixture in tempdirs; assert detection."""
    with tempfile.TemporaryDirectory() as td:
        sandbox = Path(td)
        # Each fixture lives in its own ``.cursor/agents/`` subtree so
        # ``scan_file`` resolves it as if it were a real agent prompt.
        for name, content, expected_label in (
            ("bypass.md", _OFFENDER_BYPASS, "writer CLI"),
            ("stale.md", _OFFENDER_STALE_PATH, "archived doc"),
            ("legacy.md", _OFFENDER_LEGACY_NAME, "legacy"),
        ):
            offender_path = sandbox / "agents" / name
            offender_path.parent.mkdir(parents=True, exist_ok=True)
            offender_path.write_text(content, encoding="utf-8")
            results = scan_file(offender_path)
            if not results:
                _fail(f"self-test offender {name} not detected (expected '{expected_label}')")
            _ok(f"self-test detected {name}: {results[0]}")

        clean_path = sandbox / "agents" / "clean.md"
        clean_path.write_text(_CLEAN_FIXTURE, encoding="utf-8")
        results = scan_file(clean_path)
        if results:
            _fail(f"self-test clean fixture should pass but got: {results}")
        _ok("self-test clean fixture passes")

    print("AGENT_BRIDGE_CONTRACT_SELF_TEST_OK")
    return 0


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--self-test" in args:
        return run_self_test()
    return run_default_scan()


if __name__ == "__main__":
    raise SystemExit(main())
