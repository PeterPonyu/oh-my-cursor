#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "docs" / "agent-model-policy.md"
AGENTS = ROOT / "agents"


EXPECTED_ROLES = {
    "orchestrator",
    "researcher",
    "explore",
    "planner",
    "implementer",
    "debugger",
    "test-engineer",
    "verifier",
    "critic",
    "code-reviewer",
    "security-reviewer",
    "tracer",
}


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def parse_frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        fail(f"{path.relative_to(ROOT)} missing frontmatter")
    end = text.find("\n---", 4)
    if end == -1:
        fail(f"{path.relative_to(ROOT)} unterminated frontmatter")
    values: dict[str, str] = {}
    for raw in text[4:end].strip().splitlines():
        if ":" not in raw:
            continue
        key, value = raw.split(":", 1)
        values[key.strip()] = value.strip().strip("\"'")
    return values


def validate_policy_doc() -> None:
    if not POLICY.is_file():
        fail("missing docs/agent-model-policy.md")
    text = POLICY.read_text(encoding="utf-8")
    required_tokens = [
        "All checked-in role agents under `agents/` use:",
        "model: auto",
        "Why Not Pin Composer Everywhere?",
        "Role Suitability Matrix",
        "Promotion Path",
        "scripts/resolve-cursor-model.py",
        "scripts/smoke-agent-model-suitability.sh",
    ]
    for token in required_tokens:
        if token not in text:
            fail(f"agent model policy missing token: {token}")

    for role in sorted(EXPECTED_ROLES):
        if not re.search(rf"\| `{re.escape(role)}` \| `model: auto` \|", text):
            fail(f"agent model policy missing role row for {role}")


def validate_agent_frontmatter() -> None:
    names: set[str] = set()
    for path in sorted(AGENTS.glob("*.md")):
        fields = parse_frontmatter(path)
        name = fields.get("name", "")
        names.add(name)
        if name != path.stem:
            fail(f"{path.relative_to(ROOT)} name must match filename")
        if fields.get("model") != "auto":
            fail(f"{path.relative_to(ROOT)} must stay model: auto until benchmark promotion")

    missing = EXPECTED_ROLES - names
    extra = names - EXPECTED_ROLES
    if missing:
        fail(f"missing governed agents: {sorted(missing)}")
    if extra:
        fail(f"unexpected ungoverned agents: {sorted(extra)}")


def main() -> int:
    validate_policy_doc()
    validate_agent_frontmatter()
    print("AGENT_MODEL_POLICY_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
