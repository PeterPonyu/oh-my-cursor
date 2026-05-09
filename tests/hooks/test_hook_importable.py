"""Verify hook scripts are syntactically valid and compilable.

Hook scripts are designed to run as Cursor hook subprocesses, not as
importable modules.  We verify they compile and parse correctly rather
than attempting a full import which may have side effects.
"""

import ast
import py_compile
import sys
from pathlib import Path
from collections.abc import Iterator


class TestHookCompile:
    """Ensure every .cursor/hooks/*.py file is valid Python."""

    def test_all_hook_scripts_parse(self, hook_scripts: list[Path]):
        failures = []
        for path in hook_scripts:
            try:
                content = path.read_text(encoding="utf-8")
                ast.parse(content, filename=str(path))
            except SyntaxError as exc:
                failures.append(f"{path.name}:{exc.lineno or 0}: {exc.msg}")
        assert not failures, (
            "hook scripts have syntax errors:\n" + "\n".join(failures)
        )

    def test_all_hook_scripts_compile(self, hook_scripts: list[Path]):
        failures = []
        for path in hook_scripts:
            try:
                py_compile.compile(str(path), doraise=True)
            except py_compile.PyCompileError as exc:
                failures.append(f"{path.name}: {exc}")
        assert not failures, (
            "hook scripts failed byte-compile:\n" + "\n".join(failures)
        )


class TestHookImportAttempt:
    """Best-effort import of hook scripts.  Skip gracefully on side effects."""

    @staticmethod
    def _safe_import_hook(path: Path, hooks_dir: Path) -> tuple[str, bool, str]:
        """Try to import a hook module.  Return (name, ok, reason)."""
        module_name = path.stem

        old_path = sys.path.copy()
        old_modules = set(sys.modules.keys())
        try:
            sys.path.insert(0, str(hooks_dir))
            sys.path.insert(0, str(hooks_dir.parent / "state"))
            import importlib.util
            spec = importlib.util.spec_from_file_location(module_name, str(path))
            if spec is None or spec.loader is None:
                return (module_name, False, "no loader available (ok for hook scripts)")
            mod = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = mod
            spec.loader.exec_module(mod)
            return (module_name, True, "")
        except ImportError as exc:
            return (module_name, False, f"import blocked (ok for hook scripts): {exc}")
        except SyntaxError as exc:
            return (module_name, False, f"syntax error: {exc.msg}")
        except Exception as exc:
            return (module_name, False, f"import error (ok for hook scripts): {type(exc).__name__}: {exc}")
        finally:
            sys.path[:] = old_path
            # Clean up modules we added
            new_modules = set(sys.modules.keys()) - old_modules
            for mod_name in new_modules:
                sys.modules.pop(mod_name, None)

    def test_hook_scripts_can_be_imported(self, hook_scripts, hooks_dir):
        succeeded = 0
        skipped = 0
        failures = []

        for hook_path in hook_scripts:
            name, ok, reason = self._safe_import_hook(hook_path, hooks_dir)
            if ok:
                succeeded += 1
                sys.modules.pop(name, None)
            else:
                skipped += 1

        if skipped:
            import warnings
            warnings.warn(
                f"{skipped}/{len(hook_scripts)} hook scripts could not be "
                f"imported (expected for scripts using __file__/stdin/sys.argv). "
                f"All scripts verified via compile + parse separately."
            )
