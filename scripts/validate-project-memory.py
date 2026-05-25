#!/usr/bin/env python3
"""Validate a project-memory.json document against the repo schema.

Usage:
  python3 scripts/validate-project-memory.py [path]
  python3 scripts/validate-project-memory.py --self-test

The schema (see docs/templates/project-memory.json):

  - version (int, currently 1)
  - task (string, may be empty)
  - techStack (object: languages[], frameworks[], tooling[])
  - build (object: install, test, lint, typecheck — all strings)
  - conventions (object: indent, filenameCase, moduleLayout — all strings)
  - structure (object: src, tests, docs — all strings)
  - userOwned (object: customNotes[], directives[] — both string arrays)
  - hotPaths (string array)

``userOwned.customNotes`` and ``userOwned.directives`` are user-protected:
the validator does not enforce content, only the array-of-strings shape,
so automated agents can safely append to them without overwriting prior
entries.

``--self-test`` mode is fully isolated under ``tempfile.TemporaryDirectory``
and seeds one clean fixture plus four negative fixtures.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = ROOT / "docs" / "templates" / "project-memory.json"

ALLOWED_TOP_KEYS = {
    "$comment",
    "version",
    "task",
    "techStack",
    "build",
    "conventions",
    "structure",
    "userOwned",
    "hotPaths",
}
ALLOWED_TECHSTACK_KEYS = {"languages", "frameworks", "tooling"}
ALLOWED_BUILD_KEYS = {"install", "test", "lint", "typecheck"}
ALLOWED_CONVENTIONS_KEYS = {"indent", "filenameCase", "moduleLayout"}
ALLOWED_STRUCTURE_KEYS = {"src", "tests", "docs"}
ALLOWED_USEROWNED_KEYS = {"$comment", "customNotes", "directives"}


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _ok(message: str) -> None:
    print(f"ok: {message}")


def _require_keys(obj: dict, allowed: set[str], label: str) -> None:
    extra = set(obj.keys()) - allowed
    if extra:
        _fail(f"{label} contains unsupported fields: {sorted(extra)}")


def _require_str_array(obj: object, label: str) -> None:
    if not isinstance(obj, list):
        _fail(f"{label} must be an array")
    for index, item in enumerate(obj):
        if not isinstance(item, str):
            _fail(f"{label}[{index}] must be a string")


def _require_str_dict(obj: object, allowed: set[str], label: str) -> None:
    if not isinstance(obj, dict):
        _fail(f"{label} must be an object")
    _require_keys(obj, allowed, label)
    for key, value in obj.items():
        if not isinstance(value, str):
            _fail(f"{label}.{key} must be a string")


def validate(path: Path) -> None:
    if not path.is_file():
        _fail(f"project memory file not found: {path}")
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        _fail(f"could not read {path}: {exc}")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        _fail(f"project memory is not valid JSON: {exc}")
    if not isinstance(data, dict):
        _fail("project memory root must be a JSON object")

    _require_keys(data, ALLOWED_TOP_KEYS, "project-memory")

    for required in ("version", "task", "techStack", "build", "conventions", "structure", "userOwned", "hotPaths"):
        if required not in data:
            _fail(f"project-memory missing required key: {required}")

    if not isinstance(data["version"], int) or data["version"] != 1:
        _fail("version must be the integer 1 (only schema version supported)")
    if not isinstance(data["task"], str):
        _fail("task must be a string (may be empty)")

    tech_stack = data["techStack"]
    if not isinstance(tech_stack, dict):
        _fail("techStack must be an object")
    _require_keys(tech_stack, ALLOWED_TECHSTACK_KEYS, "techStack")
    for key in ALLOWED_TECHSTACK_KEYS:
        if key not in tech_stack:
            _fail(f"techStack missing required key: {key}")
        _require_str_array(tech_stack[key], f"techStack.{key}")

    _require_str_dict(data["build"], ALLOWED_BUILD_KEYS, "build")
    for key in ALLOWED_BUILD_KEYS:
        if key not in data["build"]:
            _fail(f"build missing required key: {key}")

    _require_str_dict(data["conventions"], ALLOWED_CONVENTIONS_KEYS, "conventions")
    for key in ALLOWED_CONVENTIONS_KEYS:
        if key not in data["conventions"]:
            _fail(f"conventions missing required key: {key}")

    _require_str_dict(data["structure"], ALLOWED_STRUCTURE_KEYS, "structure")
    for key in ALLOWED_STRUCTURE_KEYS:
        if key not in data["structure"]:
            _fail(f"structure missing required key: {key}")

    user_owned = data["userOwned"]
    if not isinstance(user_owned, dict):
        _fail("userOwned must be an object")
    _require_keys(user_owned, ALLOWED_USEROWNED_KEYS, "userOwned")
    for key in ("customNotes", "directives"):
        if key not in user_owned:
            _fail(f"userOwned missing required key: {key}")
        _require_str_array(user_owned[key], f"userOwned.{key}")

    _require_str_array(data["hotPaths"], "hotPaths")

    _ok(f"project memory is valid: {path}")


# ---------------------------------------------------------------------------
# --self-test
# ---------------------------------------------------------------------------


_CLEAN_FIXTURE: dict = {
    "version": 1,
    "task": "",
    "techStack": {"languages": ["python"], "frameworks": [], "tooling": ["pytest"]},
    "build": {"install": "", "test": "pytest", "lint": "", "typecheck": ""},
    "conventions": {"indent": "4 spaces", "filenameCase": "snake_case", "moduleLayout": ""},
    "structure": {"src": "src/", "tests": "tests/", "docs": "docs/"},
    "userOwned": {"customNotes": ["note one"], "directives": ["never push to main"]},
    "hotPaths": ["scripts/validate-workflow-state.py"],
}


def _run_self_test() -> int:
    with tempfile.TemporaryDirectory() as td:
        sandbox = Path(td)

        clean = sandbox / "clean.json"
        clean.write_text(json.dumps(_CLEAN_FIXTURE, indent=2), encoding="utf-8")
        validate(clean)

        bad_version = sandbox / "bad-version.json"
        bad = dict(_CLEAN_FIXTURE)
        bad["version"] = 2
        bad_version.write_text(json.dumps(bad), encoding="utf-8")
        try:
            validate(bad_version)
        except SystemExit as exc:
            if exc.code != 1:
                print(f"FAIL: bad-version exit was {exc.code}", file=sys.stderr)
                return 1
            _ok("self-test detected bad-version")
        else:
            print("FAIL: bad-version not detected", file=sys.stderr)
            return 1

        bad_missing = sandbox / "missing-userowned.json"
        bad = dict(_CLEAN_FIXTURE)
        del bad["userOwned"]
        bad_missing.write_text(json.dumps(bad), encoding="utf-8")
        try:
            validate(bad_missing)
        except SystemExit as exc:
            if exc.code != 1:
                return 1
            _ok("self-test detected missing-userowned")
        else:
            print("FAIL: missing-userowned not detected", file=sys.stderr)
            return 1

        bad_type = sandbox / "bad-type.json"
        bad = json.loads(json.dumps(_CLEAN_FIXTURE))
        bad["techStack"]["languages"] = "python"  # type: ignore[index]
        bad_type.write_text(json.dumps(bad), encoding="utf-8")
        try:
            validate(bad_type)
        except SystemExit as exc:
            if exc.code != 1:
                return 1
            _ok("self-test detected bad-type")
        else:
            print("FAIL: bad-type not detected", file=sys.stderr)
            return 1

        bad_extra = sandbox / "bad-extra.json"
        bad = json.loads(json.dumps(_CLEAN_FIXTURE))
        bad["surprise"] = "field"
        bad_extra.write_text(json.dumps(bad), encoding="utf-8")
        try:
            validate(bad_extra)
        except SystemExit as exc:
            if exc.code != 1:
                return 1
            _ok("self-test detected bad-extra")
        else:
            print("FAIL: bad-extra not detected", file=sys.stderr)
            return 1

    if TEMPLATE_PATH.is_file():
        validate(TEMPLATE_PATH)
        _ok(f"shipped template passes: {TEMPLATE_PATH.relative_to(ROOT)}")
    else:
        print(f"FAIL: shipped template missing: {TEMPLATE_PATH}", file=sys.stderr)
        return 1

    print("VALIDATE_PROJECT_MEMORY_SELF_TEST_OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--self-test" in args:
        return _run_self_test()
    target = Path(args[0]) if args else TEMPLATE_PATH
    validate(target)
    print("VALIDATE_PROJECT_MEMORY_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
