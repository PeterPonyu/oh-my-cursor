"""Verify hook scripts respect the read-only contract for workflow-state.

Uses the existing scripts/validate-hook-readonly.py as reference for which
write patterns are forbidden (write_text, write_bytes, open with 'w' mode,
json.dump) when targeting .cursor/state/workflow-state*.json or docs/plans/.
"""

import ast
import re
from pathlib import Path


# Patterns from scripts/validate-hook-readonly.py
STATE_PATH_RE = re.compile(r"\.cursor/state/workflow-state(?:\.[A-Za-z]+)?\.json")
DOCS_PLANS_RE = re.compile(r"docs/plans/")

# Method names / builtins that indicate file writes
FILO_WRITE_METHODS = {"write_text", "write_bytes"}
JSON_DUMP_NAMES = {"dump", "dumps"}
FILE_OPEN_BUILTIN = "open"

# Scripts deliberately excluded from the read-only scan (internal helpers
# that are not hook event handlers).
EXCLUDED_HOOKS = {"_trace.py", "_tool_payload.py", "_active_role.py"}


def _hook_files(hooks_dir: Path) -> list[Path]:
    """Return public hook scripts (exclude trace/tool/role helpers)."""
    return sorted(
        p for p in hooks_dir.glob("*.py") if p.name not in EXCLUDED_HOOKS
    )


def _is_open_for_write(node: ast.Call) -> bool:
    """Check if an open() call uses a write mode ('w', 'a', 'x', 'wb', etc.)."""
    # open(file, mode, ...) — check second positional arg or 'mode' kwarg
    args = node.args
    if len(args) >= 2:
        mode = args[1]
        if isinstance(mode, ast.Constant) and isinstance(mode.value, str):
            if any(c in mode.value for c in "wax+"):
                return True
    for kw in node.keywords:
        if kw.arg == "mode" and isinstance(kw.value, ast.Constant):
            if isinstance(kw.value.value, str) and any(c in kw.value.value for c in "wax+"):
                return True
    return False


def _is_path_call(node: ast.Call) -> bool:
    """Check if this is Path(...) construction."""
    return isinstance(node.func, ast.Name) and node.func.id == "Path"


def _extract_string_args(call: ast.Call) -> list[str]:
    """Return all string literal arguments from a call node."""
    result = []
    for node in ast.walk(call):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            result.append(node.value)
    return result


def _targets_state(path_str: str) -> bool:
    """Check if the string targets a protected state path."""
    return bool(STATE_PATH_RE.search(path_str) or DOCS_PLANS_RE.search(path_str))


def _read_file_safe(path: Path) -> str | None:
    """Read a file, returning None on error."""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


class TestHookReadonlyContract:
    """Verify public hook scripts do not perform file writes to workflow-state."""

    # -- write_text / write_bytes -------------------------------------------------

    def test_no_write_text_bytes_to_state(self, hooks_dir, workflow_state_paths):
        src_files = _hook_files(hooks_dir)
        violations = []
        for path in src_files:
            content = _read_file_safe(path)
            if content is None:
                continue
            for line_no, line in enumerate(content.splitlines(), start=1):
                stripped = line.strip()
                if any(m in stripped for m in ("write_text(", "write_bytes(")):
                    for state_path in workflow_state_paths:
                        if state_path in stripped:
                            violations.append(
                                f"{path.name}:{line_no} write_text/write_bytes targeting {state_path!r}"
                            )
        assert not violations, (
            "hooks contain write_text/write_bytes calls to workflow-state:\n"
            + "\n".join(violations)
        )

    # -- json.dump / json.dumps ---------------------------------------------------

    def test_no_json_dump_to_state(self, hooks_dir, workflow_state_paths):
        src_files = _hook_files(hooks_dir)
        violations = []
        for path in src_files:
            content = _read_file_safe(path)
            if content is None:
                continue
            try:
                tree = ast.parse(content, filename=str(path))
            except SyntaxError as exc:
                violations.append(f"{path.name}:{exc.lineno or 0}: syntax error: {exc.msg}")
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                func = node.func
                if isinstance(func, ast.Attribute) and func.attr in JSON_DUMP_NAMES:
                    strings = _extract_string_args(node)
                    for s in strings:
                        if _targets_state(s):
                            violations.append(
                                f"{path.name}:{node.lineno} json.{func.attr} targeting {s!r}"
                            )

        assert not violations, (
            "hooks contain json.dump/dumps calls to workflow-state:\n"
            + "\n".join(violations)
        )

    # -- open(..., mode='w') ------------------------------------------------------

    def test_no_open_write_to_state(self, hooks_dir, workflow_state_paths):
        src_files = _hook_files(hooks_dir)
        violations = []
        for path in src_files:
            content = _read_file_safe(path)
            if content is None:
                continue
            try:
                tree = ast.parse(content, filename=str(path))
            except SyntaxError as exc:
                violations.append(f"{path.name}:{exc.lineno or 0}: syntax error: {exc.msg}")
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                func = node.func
                is_open_call = (
                    (isinstance(func, ast.Name) and func.id == FILE_OPEN_BUILTIN)
                    or (isinstance(func, ast.Attribute) and func.attr == FILE_OPEN_BUILTIN)
                )
                if not is_open_call:
                    continue
                if not _is_open_for_write(node):
                    continue
                strings = _extract_string_args(node)
                for s in strings:
                    if _targets_state(s):
                        violations.append(
                            f"{path.name}:{node.lineno} open(..., write-mode) targeting {s!r}"
                        )

        assert not violations, (
            "hooks contain open() in write mode to workflow-state:\n"
            + "\n".join(violations)
        )

    # -- Path construction + write -------------------------------------------------

    def test_no_path_write_target_state(self, hooks_dir, workflow_state_paths):
        src_files = _hook_files(hooks_dir)
        violations = []
        for path in src_files:
            content = _read_file_safe(path)
            if content is None:
                continue
            try:
                tree = ast.parse(content, filename=str(path))
            except SyntaxError as exc:
                violations.append(f"{path.name}:{exc.lineno or 0}: syntax error: {exc.msg}")
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                func = node.func
                if isinstance(func, ast.Attribute) and func.attr in FILO_WRITE_METHODS:
                    obj = func.value
                    if isinstance(obj, ast.Call) and _is_path_call(obj):
                        strings = _extract_string_args(obj)
                        for s in strings:
                            if _targets_state(s):
                                violations.append(
                                    f"{path.name}:{node.lineno} Path(...).{func.attr}() "
                                    f"targeting {s!r}"
                                )

        assert not violations, (
            "hooks contain Path(...).write_text() / write_bytes() to workflow-state:\n"
            + "\n".join(violations)
        )

    # -- full-scan integration (mirrors validate-hook-readonly.py default scan) ---

    def test_full_ast_scan_matches_validator(self, hooks_dir):
        src_files = _hook_files(hooks_dir)
        for path in src_files:
            content = _read_file_safe(path)
            if content is None:
                continue
            try:
                tree = ast.parse(content, filename=str(path))
            except SyntaxError:
                # Syntax errors caught by importable test
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                func = node.func
                is_write_call = False
                if isinstance(func, ast.Attribute):
                    if func.attr in FILO_WRITE_METHODS | JSON_DUMP_NAMES:
                        is_write_call = True
                if isinstance(func, ast.Name) and func.id == FILE_OPEN_BUILTIN:
                    if _is_open_for_write(node):
                        is_write_call = True
                if is_write_call:
                    strings = _extract_string_args(node)
                    for s in strings:
                        assert not _targets_state(s), (
                            f"{path.name}:{node.lineno} write to state path {s!r}"
                        )

    def test_no_state_path_in_shell_guard_severe(self, hooks_dir):
        """Shell guard's severe patterns reference state paths as strings
        in regexes — those are defensive, not offensive writes.  Ensure
        they appear inside re.compile() and not as raw file writes."""
        shell_guard = hooks_dir / "shell-guard.py"
        if not shell_guard.is_file():
            return
        content = _read_file_safe(shell_guard)
        assert content is not None, "cannot read shell-guard.py"
        tree = ast.parse(content, filename=str(shell_guard))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if isinstance(func, ast.Attribute) and func.attr in FILO_WRITE_METHODS:
                strings = _extract_string_args(node)
                for s in strings:
                    assert not _targets_state(s), (
                        f"shell-guard.py:{node.lineno} write_text/write_bytes "
                        f"to state path {s!r}"
                    )
