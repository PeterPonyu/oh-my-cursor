#!/usr/bin/env python3
"""Assert hooks are read-only against ``.cursor/state/workflow-state.json``.

Phase 5 of mcp-state-bridge-2026-05.  Three modes:

1. **default scan**: AST-walks every ``.cursor/hooks/*.py`` (excluding the
   sibling ``_trace.py`` helper) and reports any call whose argument is a
   string literal pointing at ``.cursor/state/workflow-state*.json`` and
   whose method name is a write-shape (``write_text``, ``write_bytes``,
   ``open``, ``json.dump``).  Writes elsewhere -- notably ``.omcs/`` --
   are not flagged at all (implicit allowlist; AC-505).

2. ``--check-shared-lock``: imports the shared library at
   ``.cursor/state/workflow-state.py`` (which does ``from _locking import
   file_lock``) and asserts (a) the resulting ``_locking`` module's
   ``__file__`` resolves to ``.cursor/state/_locking.py``, (b) no module
   under ``.cursor/state/`` imports anything from ``mcp/``, (c) the
   bridge does not ship a duplicate ``_locking.py`` of its own.  This is
   the structural enforcement of "the CLI shim and the bridge share the
   same lock".

3. ``--self-test``: seeds a synthetic offender hook + a synthetic
   ``_trace.py``-style hook inside an isolated
   :class:`tempfile.TemporaryDirectory` (per V2), runs the scan, and
   asserts the offender is detected and the trace path is not.  The
   working tree is never mutated.

Stdlib-only.
"""
from __future__ import annotations

import ast
import importlib.util
import re
import sys
import tempfile
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOOKS_DIR = ROOT / "hooks"
STATE_DIR = ROOT / ".cursor" / "state"
BRIDGE_DIR = ROOT / "mcp" / "cursor-state-bridge"

# Match writes to the workflow-state document family.
STATE_PATH_RE = re.compile(r"\.cursor/state/workflow-state(?:\.[A-Za-z]+)?\.json")

# Methods that produce a side-effecting write when called with a path-like.
WRITE_METHODS = {"write_text", "write_bytes", "open"}
JSON_WRITE_NAMES = {"dump"}  # json.dump(..., open(path, 'w'))

# Hook scripts excluded from scanning by name.
TRACE_HELPER_NAME = "_trace.py"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _ok(message: str) -> None:
    print(f"ok: {message}")


# ---------------------------------------------------------------------------
# Mode 1: default AST scan
# ---------------------------------------------------------------------------


def _is_write_call(node: ast.Call) -> bool:
    """Return True when this call shape is a write-style operation."""
    func = node.func
    if isinstance(func, ast.Attribute):
        if func.attr in WRITE_METHODS:
            return True
        if func.attr in JSON_WRITE_NAMES:
            return True
    if isinstance(func, ast.Name):
        if func.id == "open":
            return True
    return False


def _scan_string_literals(call: ast.Call) -> list[tuple[int, str]]:
    """Return (line, literal) pairs for every string literal inside this call."""
    out: list[tuple[int, str]] = []
    for sub in ast.walk(call):
        if isinstance(sub, ast.Constant) and isinstance(sub.value, str):
            out.append((sub.lineno, sub.value))
    return out


def scan_file(path: Path) -> list[str]:
    """Return list of offender descriptions; empty if clean."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        return [f"{path.name}: read error: {exc}"]
    try:
        tree = ast.parse(text, filename=str(path))
    except SyntaxError as exc:
        return [f"{path.name}:{exc.lineno or 0}: syntax error: {exc.msg}"]

    offenders: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not _is_write_call(node):
            continue
        for line, literal in _scan_string_literals(node):
            if STATE_PATH_RE.search(literal):
                offenders.append(
                    f"{path.name}:{line} write call targets state document path "
                    f"{literal!r}"
                )
    return offenders


def _hook_files() -> list[Path]:
    if not HOOKS_DIR.is_dir():
        _fail(f"hooks directory missing: {HOOKS_DIR}")
    return sorted(p for p in HOOKS_DIR.glob("*.py") if p.name != TRACE_HELPER_NAME)


def run_default_scan() -> int:
    files = _hook_files()
    offenders: list[str] = []
    for path in files:
        offenders.extend(scan_file(path))

    if offenders:
        print("FAIL: hook read-only contract violated:", file=sys.stderr)
        for line in offenders:
            print(f"  {line}", file=sys.stderr)
        return 1

    _ok(f"scanned {len(files)} hook files; none write to .cursor/state/workflow-state*.json")
    print("HOOK_READONLY_OK")
    return 0


# ---------------------------------------------------------------------------
# Mode 2: --check-shared-lock
# ---------------------------------------------------------------------------


_FORBIDDEN_MCP_IMPORT = re.compile(
    r"^\s*from\s+mcp[._/]|^\s*import\s+mcp\b",
    re.MULTILINE,
)


def run_check_shared_lock() -> int:
    if not STATE_DIR.is_dir():
        _fail(f"state directory missing: {STATE_DIR}")

    # Make `_locking` importable for the loaded library.
    if str(STATE_DIR) not in sys.path:
        sys.path.insert(0, str(STATE_DIR))

    # Load the workflow-state library; this triggers `from _locking import file_lock`.
    lib_path = STATE_DIR / "workflow-state.py"
    if not lib_path.is_file():
        _fail(f"workflow-state library missing: {lib_path}")
    spec = importlib.util.spec_from_file_location("_omcs_validate_shared_lock", str(lib_path))
    if spec is None:
        _fail(f"could not build module spec for {lib_path}")
    if spec.loader is None:  # type: ignore[union-attr]
        _fail(f"module spec for {lib_path} has no loader")
    module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    sys.modules["_omcs_validate_shared_lock"] = module
    spec.loader.exec_module(module)  # type: ignore[union-attr]

    # _locking should now be in sys.modules under its import name.
    locking = sys.modules.get("_locking")
    if locking is None or not hasattr(locking, "file_lock"):
        _fail("workflow-state library did not import a `_locking` module with `file_lock`")
    if locking.__file__ is None:  # type: ignore[union-attr]
        _fail("loaded `_locking` module has no __file__ attribute")

    expected_locking = (STATE_DIR / "_locking.py").resolve()
    actual_locking = Path(locking.__file__).resolve()  # type: ignore[union-attr,arg-type]
    if actual_locking != expected_locking:
        _fail(
            f"`_locking` loaded from {actual_locking} but expected {expected_locking}; "
            "the CLI shim and the bridge must source the lock from .cursor/state/_locking.py"
        )

    # No module under .cursor/state/ may import from mcp/.
    forbidden: list[str] = []
    for py_file in STATE_DIR.glob("*.py"):
        text = py_file.read_text(encoding="utf-8")
        if _FORBIDDEN_MCP_IMPORT.search(text):
            forbidden.append(str(py_file.relative_to(ROOT)))
    if forbidden:
        _fail(
            ".cursor/state/ modules import from mcp/: " + ", ".join(forbidden)
            + "; the dependency direction must be bridge → .cursor/state/, never reverse"
        )

    # Bridge must not ship a duplicate `_locking.py`.
    duplicate = BRIDGE_DIR / "_locking.py"
    if duplicate.is_file():
        _fail(
            f"bridge ships a duplicate {duplicate.relative_to(ROOT)}; "
            "the lock primitive must live only at .cursor/state/_locking.py (V1)"
        )

    _ok(f"`_locking` sourced from {expected_locking.relative_to(ROOT)}")
    _ok(".cursor/state/ modules do not import from mcp/")
    _ok("bridge does not ship a duplicate _locking.py")
    print("HOOK_READONLY_SHARED_LOCK_OK")
    return 0


# ---------------------------------------------------------------------------
# Mode 3: --self-test (V2 isolation)
# ---------------------------------------------------------------------------


def run_self_test() -> int:
    """Seed two synthetic hooks in an isolated tempdir; verify scan behaviour."""
    with tempfile.TemporaryDirectory() as td:
        sandbox = Path(td)

        offender = sandbox / "_evil.py"
        offender.write_text(
            textwrap.dedent(
                """
                from pathlib import Path
                Path(".cursor/state/workflow-state.json").write_text("{}")
                """
            ).strip()
            + "\n",
            encoding="utf-8",
        )

        trace_path = sandbox / "_trace.py"
        trace_path.write_text(
            textwrap.dedent(
                """
                from pathlib import Path
                Path(".omcs/hook-trace.log").write_text("{}")
                """
            ).strip()
            + "\n",
            encoding="utf-8",
        )

        offender_results = scan_file(offender)
        if not offender_results:
            _fail("self-test offender not detected; AST scan is broken")
        _ok(f"self-test offender detected: {offender_results[0]}")

        trace_results = scan_file(trace_path)
        if trace_results:
            _fail(
                "self-test allowlist failed: a write to .omcs/hook-trace.log "
                "was reported as a state-file write -- " + str(trace_results)
            )
        _ok("self-test allowlist: write to .omcs/hook-trace.log NOT flagged")

    # Tempdir is auto-cleaned; the working tree was never touched.
    print("HOOK_READONLY_SELF_TEST_OK")
    return 0


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--self-test" in args:
        return run_self_test()
    if "--check-shared-lock" in args:
        return run_check_shared_lock()
    return run_default_scan()


if __name__ == "__main__":
    raise SystemExit(main())
