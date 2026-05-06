#!/usr/bin/env python3
from __future__ import annotations

import json
import py_compile
import re
import shlex
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KEBAB_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"could not parse {path.relative_to(ROOT)}: {exc}")


def command_path(command: str) -> Path | None:
    try:
        parts = shlex.split(command)
    except ValueError:
        return None
    for part in parts:
        if part.endswith(".py") or part.startswith(".cursor/hooks/"):
            candidate = (ROOT / part).resolve()
            hooks_dir = (ROOT / ".cursor" / "hooks").resolve()
            try:
                candidate.relative_to(hooks_dir)
            except ValueError:
                return None
            return candidate
    return None


def iter_hook_entries(value):
    if isinstance(value, str):
        yield {"command": value}
    elif isinstance(value, dict):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from iter_hook_entries(item)


def validate_hooks() -> None:
    hooks_path = ROOT / ".cursor" / "hooks.json"
    if not hooks_path.is_file():
        fail("missing .cursor/hooks.json")
    data = load_json(hooks_path)
    if data.get("version") != 1:
        fail(".cursor/hooks.json must use version 1")
    hooks = data.get("hooks")
    if not isinstance(hooks, dict):
        fail(".cursor/hooks.json must contain a hooks object")

    required_events = {
        "afterFileEdit": ".cursor/hooks/claim-guard.py",
        "stop": ".cursor/hooks/stop-gate.py",
    }
    for event, expected_script in required_events.items():
        entries = list(iter_hook_entries(hooks.get(event)))
        if not entries:
            fail(f"missing hook event {event}")
        commands = [entry.get("command") for entry in entries if isinstance(entry.get("command"), str)]
        if not any(expected_script in command for command in commands):
            fail(f"{event} must call {expected_script}")
        for command in commands:
            path = command_path(command)
            if path is None:
                fail(f"could not identify script path in hook command: {command}")
            if not path.is_file():
                fail(f"hook command path does not exist: {path.relative_to(ROOT)}")
            py_compile.compile(str(path), doraise=True)

    stop_entries = list(iter_hook_entries(hooks.get("stop")))
    if not any(entry.get("loop_limit") in (0, 1) for entry in stop_entries if isinstance(entry, dict)):
        fail("stop hook must include a conservative loop_limit")
    print("HOOKS_ARTIFACTS_OK")


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        fail(f"{path.relative_to(ROOT)} missing YAML frontmatter")
    end = text.find("\n---", 4)
    if end == -1:
        fail(f"{path.relative_to(ROOT)} has unterminated YAML frontmatter")
    raw = text[4:end].strip().splitlines()
    frontmatter: dict[str, str] = {}
    for line in raw:
        if not line.strip():
            continue
        if ":" not in line:
            fail(f"{path.relative_to(ROOT)} has invalid frontmatter line: {line}")
        key, value = line.split(":", 1)
        frontmatter[key.strip()] = value.strip().strip('"\'')
    return frontmatter, text[end + 4 :].strip()


def validate_agents() -> None:
    agents_dir = ROOT / ".cursor" / "agents"
    if not agents_dir.is_dir():
        fail("missing .cursor/agents directory")
    agents = sorted(agents_dir.glob("*.md"))
    expected = {"orchestrator", "verifier", "critic", "debugger", "security-reviewer", "planner", "researcher"}
    names: set[str] = set()
    for path in agents:
        frontmatter, body = parse_frontmatter(path)
        for key in ("name", "description", "model", "readonly"):
            if not frontmatter.get(key):
                fail(f"{path.relative_to(ROOT)} missing frontmatter key {key}")
        name = frontmatter["name"]
        if not KEBAB_RE.fullmatch(name):
            fail(f"agent name must be kebab-case: {name}")
        if name != path.stem:
            fail(f"agent file name must match frontmatter name: {path.name}")
        if frontmatter["readonly"] not in {"true", "false"}:
            fail(f"agent readonly must be true or false: {path.name}")
        if not body:
            fail(f"agent body must not be empty: {path.name}")
        names.add(name)
    missing = expected - names
    if missing:
        fail(f"missing required agents: {sorted(missing)}")
    print("AGENTS_ARTIFACTS_OK")


def validate_plugin_manifest() -> None:
    manifest_path = ROOT / ".cursor-plugin" / "plugin.json"
    if not manifest_path.is_file():
        fail("missing .cursor-plugin/plugin.json")
    manifest = load_json(manifest_path)
    expected = {
        "rules": "rules",
        "skills": "skills",
        "agents": ".cursor/agents",
        "hooks": ".cursor/hooks.json",
    }
    for key, value in expected.items():
        if manifest.get(key) != value:
            fail(f"plugin manifest must set {key!r} to {value!r}")


def main() -> int:
    validate_hooks()
    validate_agents()
    validate_plugin_manifest()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())