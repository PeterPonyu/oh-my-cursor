#!/usr/bin/env python3
from __future__ import annotations

import json
import py_compile
import re
import shlex
import ast
from pathlib import Path
from typing import NoReturn


ROOT = Path(__file__).resolve().parents[1]
KEBAB_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")

EXPECTED_AGENT_READONLY = {
    "architect": "true",
    "code-reviewer": "true",
    "critic": "true",
    "debugger": "false",
    "explore": "true",
    "implementer": "false",
    "orchestrator": "false",
    "planner": "true",
    "qa-tester": "true",
    "researcher": "true",
    "security-reviewer": "true",
    "test-engineer": "false",
    "tracer": "true",
    "verifier": "true",
}

EXPECTED_SKILLS = {
    "auto-execute",
    "debug",
    "deep-interview",
    "doctor",
    "iterate-loop",
    "local-plugin-check",
    "mcp-setup",
    "parallel-batch",
    "phase-controller",
    "plan",
    "review",
    "security-review",
    "trace",
    "verify",
}

MCP_TOOL_NAMES = {
    "state_read",
    "state_init",
    "state_set_phase",
    "state_record_failure",
    "state_update_acceptance_criterion",
    "state_history_append",
}

EXPECTED_AGENT_MCP_TOOLS = {
    "architect": {"state_read"},
    "code-reviewer": {"state_read"},
    "critic": {"state_read"},
    "debugger": {"state_read", "state_record_failure", "state_history_append"},
    "explore": {"state_read"},
    "implementer": {"state_read", "state_set_phase", "state_update_acceptance_criterion", "state_history_append"},
    "orchestrator": MCP_TOOL_NAMES,
    "planner": {"state_read"},
    "qa-tester": {"state_read", "state_update_acceptance_criterion", "state_history_append"},
    "researcher": {"state_read"},
    "security-reviewer": {"state_read"},
    "test-engineer": {"state_read", "state_set_phase", "state_update_acceptance_criterion"},
    "tracer": {"state_read", "state_history_append"},
    "verifier": {"state_read", "state_update_acceptance_criterion"},
}

EXPECTED_SKILL_MCP_TOOLS = {
    "auto-execute": {"state_init", "state_set_phase", "state_record_failure", "state_update_acceptance_criterion"},
    "debug": set(),
    "deep-interview": set(),
    "doctor": set(),
    "iterate-loop": {"state_record_failure", "state_update_acceptance_criterion", "state_history_append"},
    "local-plugin-check": set(),
    "mcp-setup": MCP_TOOL_NAMES,
    "parallel-batch": set(),
    "phase-controller": MCP_TOOL_NAMES,
    "plan": set(),
    "review": set(),
    "security-review": set(),
    "trace": set(),
    "verify": {"state_read", "state_update_acceptance_criterion", "state_history_append"},
}


def fail(message: str) -> NoReturn:
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
        if part.endswith(".py") or part.startswith("hooks/"):
            candidate = (ROOT / part).resolve()
            hooks_dir = (ROOT / "hooks").resolve()
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


def _helper_imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    helpers: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("_"):
            helpers.add(node.module.split(".", 1)[0] + ".py")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("_"):
                    helpers.add(alias.name.split(".", 1)[0] + ".py")
    return helpers


def _mcp_tools_from_text(text: str) -> set[str]:
    return set(re.findall(r"(?:mcp__cursor-state-bridge__)?(state_[a-z_]+)", text))


def _section(text: str, start_heading: str, end_heading: str) -> str:
    lower = text.lower()
    start = lower.find(start_heading.lower())
    if start == -1:
        return ""
    end = lower.find(end_heading.lower(), start + len(start_heading))
    return text[start:] if end == -1 else text[start:end]

def validate_hooks() -> None:
    hooks_path = ROOT / "hooks" / "hooks.json"
    if not hooks_path.is_file():
        fail("missing hooks/hooks.json")
    data = load_json(hooks_path)
    if data.get("version") != 1:
        fail("hooks/hooks.json must use version 1")
    hooks = data.get("hooks")
    if not isinstance(hooks, dict):
        fail("hooks/hooks.json must contain a hooks object")

    required_events = {
        "sessionStart": "hooks/session-bootstrap.py",
        "sessionEnd": "hooks/session-summary.py",
        "beforeSubmitPrompt": "hooks/prompt-router.py",
        "preToolUse": "hooks/tool-guard.py",
        "postToolUse": "hooks/state-watcher.py",
        "postToolUseFailure": "hooks/failure-router.py",
        "subagentStart": "hooks/subagent-bootstrap.py",
        "subagentStop": "hooks/subagent-summary.py",
        "beforeShellExecution": "hooks/shell-guard.py",
        "afterShellExecution": "hooks/shell-debrief.py",
        "beforeReadFile": "hooks/read-advisor.py",
        "afterFileEdit": "hooks/claim-guard.py",
        "preCompact": "hooks/compact-reminder.py",
        "stop": "hooks/stop-gate.py",
    }
    extra_events = set(hooks) - set(required_events)
    if extra_events:
        fail(f"unexpected hook events in hooks/hooks.json: {sorted(extra_events)}")

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
            assert path is not None  # type narrow after fail exit
            if not path.is_file():
                fail(f"hook command path does not exist: {path.relative_to(ROOT)}")
            py_compile.compile(str(path), doraise=True)

    stop_entries = list(iter_hook_entries(hooks.get("stop")))
    if not any(entry.get("loop_limit") in (0, 1) for entry in stop_entries if isinstance(entry, dict)):
        fail("stop hook must include a conservative loop_limit")

    trace_helper = ROOT / "hooks" / "_trace.py"
    if not trace_helper.is_file():
        fail("missing hooks/_trace.py shared trace helper")
    py_compile.compile(str(trace_helper), doraise=True)

    referenced = {Path(command).name for event in required_events for command in [required_events[event]]}
    hook_files = {path.name for path in (ROOT / "hooks").glob("*.py")}
    helper_files = {name for name in hook_files if name.startswith("_")}
    entrypoint_files = hook_files - helper_files
    orphan_entrypoints = entrypoint_files - referenced
    if orphan_entrypoints:
        fail(f"orphan hook entrypoint files not referenced by hooks/hooks.json: {sorted(orphan_entrypoints)}")
    imported_helpers: set[str] = set()
    for path in (ROOT / "hooks").glob("*.py"):
        imported_helpers.update(_helper_imports(path))
    orphan_helpers = helper_files - imported_helpers
    if orphan_helpers:
        fail(f"orphan hook helper files not imported by any hook: {sorted(orphan_helpers)}")

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
    agents_dir = ROOT / "agents"
    if not agents_dir.is_dir():
        fail("missing agents/ directory")
    agents = sorted(agents_dir.glob("*.md"))
    expected = set(EXPECTED_AGENT_READONLY)
    names: set[str] = set()
    for path in agents:
        frontmatter, body = parse_frontmatter(path)
        for key in ("name", "description", "model", "readonly", "tools"):
            if not frontmatter.get(key):
                fail(f"{path.relative_to(ROOT)} missing frontmatter key {key}")
        name = frontmatter["name"]
        if not KEBAB_RE.fullmatch(name):
            fail(f"agent name must be kebab-case: {name}")
        if name != path.stem:
            fail(f"agent file name must match frontmatter name: {path.name}")
        if frontmatter["readonly"] not in {"true", "false"}:
            fail(f"agent readonly must be true or false: {path.name}")
        if name in EXPECTED_AGENT_READONLY and frontmatter["readonly"] != EXPECTED_AGENT_READONLY[name]:
            fail(f"agent readonly policy drift for {name}: expected {EXPECTED_AGENT_READONLY[name]}, got {frontmatter['readonly']}")
        if frontmatter["model"] != "auto":
            fail(f"agent model must remain auto unless benchmark evidence updates policy: {path.name}")
        if not frontmatter["description"].startswith("[OMCS]"):
            fail(f"agent description must start with [OMCS]: {path.name}")
        declared_mcp = _mcp_tools_from_text(frontmatter.get("tools", ""))
        unknown_mcp = declared_mcp - MCP_TOOL_NAMES
        if unknown_mcp:
            fail(f"agent {name} declares unknown MCP tools: {sorted(unknown_mcp)}")
        expected_mcp = EXPECTED_AGENT_MCP_TOOLS.get(name, set())
        if declared_mcp != expected_mcp:
            fail(f"agent {name} MCP tool policy drift: expected {sorted(expected_mcp)}, got {sorted(declared_mcp)}")
        body_mcp = _mcp_tools_from_text(body)
        missing_body_mentions = expected_mcp - body_mcp
        if missing_body_mentions:
            fail(f"agent {name} body does not document MCP tools: {sorted(missing_body_mentions)}")
        if not body:
            fail(f"agent body must not be empty: {path.name}")
        names.add(name)
    missing = expected - names
    if missing:
        fail(f"missing required agents: {sorted(missing)}")
    extra = names - expected
    if extra:
        fail(f"unexpected ungoverned agents: {sorted(extra)}")
    print("AGENTS_ARTIFACTS_OK")


def validate_skills() -> None:
    skills_dir = ROOT / "skills"
    if not skills_dir.is_dir():
        fail("missing skills/ directory")
    paths = sorted(skills_dir.glob("*/SKILL.md"))
    names: set[str] = set()
    for path in paths:
        frontmatter, body = parse_frontmatter(path)
        for key in ("name", "description"):
            if not frontmatter.get(key):
                fail(f"{path.relative_to(ROOT)} missing frontmatter key {key}")
        name = frontmatter["name"]
        if not KEBAB_RE.fullmatch(name):
            fail(f"skill name must be kebab-case: {name}")
        if name != path.parent.name:
            fail(f"skill directory must match frontmatter name: {path.relative_to(ROOT)}")
        if not frontmatter["description"].startswith("[OMCS]"):
            fail(f"skill description must start with [OMCS]: {path.relative_to(ROOT)}")
        lowered = body.lower()
        for heading in ("## governance", "## mcp integration points", "## orchestration role"):
            if heading not in lowered:
                fail(f"{path.relative_to(ROOT)} missing required section {heading}")
        mcp_section = _section(body, "## MCP Integration Points", "## Hooks Dependencies")
        declared_mcp = _mcp_tools_from_text(mcp_section)
        unknown_mcp = declared_mcp - MCP_TOOL_NAMES
        if unknown_mcp:
            fail(f"skill {name} MCP section references unknown tools: {sorted(unknown_mcp)}")
        expected_mcp = EXPECTED_SKILL_MCP_TOOLS.get(name, set())
        if expected_mcp:
            missing = expected_mcp - declared_mcp
            extra = declared_mcp - expected_mcp
            if missing or extra:
                fail(f"skill {name} MCP tool policy drift: missing {sorted(missing)}, extra {sorted(extra)}")
        elif "no direct mcp integration" not in mcp_section.lower():
            fail(f"skill {name} has no governed MCP tools and must state 'No direct MCP integration'")
        names.add(name)

    missing = EXPECTED_SKILLS - names
    extra = names - EXPECTED_SKILLS
    if missing:
        fail(f"missing required skills: {sorted(missing)}")
    if extra:
        fail(f"unexpected ungoverned skills: {sorted(extra)}")
    print("SKILLS_ARTIFACTS_OK")


def _literal_set(path: Path, variable: str) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == variable for target in node.targets):
            continue
        if not isinstance(node.value, ast.Set):
            fail(f"{path.relative_to(ROOT)} {variable} must be a literal set")
        values: set[str] = set()
        for item in node.value.elts:
            if not isinstance(item, ast.Constant) or not isinstance(item.value, str):
                fail(f"{path.relative_to(ROOT)} {variable} must contain string literals only")
            values.add(item.value)
        return values
    fail(f"{path.relative_to(ROOT)} missing {variable}")


def validate_router_registries() -> None:
    prompt_router = ROOT / "hooks" / "prompt-router.py"
    subagent_bootstrap = ROOT / "hooks" / "subagent-bootstrap.py"
    skill_names = _literal_set(prompt_router, "SKILL_NAMES")
    agent_names = _literal_set(prompt_router, "AGENT_NAMES")
    known_roles = _literal_set(subagent_bootstrap, "KNOWN_ROLES")
    expected_agents = set(EXPECTED_AGENT_READONLY)

    if skill_names != EXPECTED_SKILLS:
        fail(f"prompt-router SKILL_NAMES drift: expected {sorted(EXPECTED_SKILLS)}, got {sorted(skill_names)}")
    if agent_names != expected_agents:
        fail(f"prompt-router AGENT_NAMES drift: expected {sorted(expected_agents)}, got {sorted(agent_names)}")
    if known_roles != expected_agents:
        fail(f"subagent-bootstrap KNOWN_ROLES drift: expected {sorted(expected_agents)}, got {sorted(known_roles)}")

    orchestration = (ROOT / "docs" / "orchestration.md").read_text(encoding="utf-8")
    for name in sorted(expected_agents | EXPECTED_SKILLS):
        if name not in orchestration:
            fail(f"docs/orchestration.md missing governed registry name: {name}")
    print("ROUTER_REGISTRY_OK")


def validate_plugin_manifest() -> None:
    manifest_path = ROOT / ".cursor-plugin" / "plugin.json"
    if not manifest_path.is_file():
        fail("missing .cursor-plugin/plugin.json")
    manifest = load_json(manifest_path)
    # Rules, skills, agents, hooks use Cursor default discovery.
    # If overridden in manifest, they must point to the standard locations.
    defaults = {
        "rules": "rules",
        "skills": "skills",
        "agents": "agents",
        "hooks": "hooks/hooks.json",
    }
    for key, expected in defaults.items():
        actual = manifest.get(key)
        if actual is not None and actual != expected:
            fail(f"plugin manifest {key!r} path ({actual!r}) must match default ({expected!r}) or be omitted")


def main() -> int:
    validate_hooks()
    validate_agents()
    validate_skills()
    validate_router_registries()
    validate_plugin_manifest()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())