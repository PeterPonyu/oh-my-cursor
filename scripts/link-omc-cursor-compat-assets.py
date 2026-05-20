#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

KEBAB_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text
    fields: dict[str, str] = {}
    for raw in text[4:end].strip().splitlines():
        if ":" not in raw:
            continue
        key, value = raw.split(":", 1)
        fields[key.strip()] = value.strip().strip("\"'")
    return fields, text[end + 4 :]


def render_frontmatter(fields: dict[str, str], body: str) -> str:
    lines = ["---"]
    for key, value in fields.items():
        if re.search(r"[:#\[\]{}]", value):
            value = '"' + value.replace('"', '\\"') + '"'
        lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines) + body


def latest_omc_cache(home: Path) -> Path:
    root = home / ".claude" / "plugins" / "cache" / "omc" / "oh-my-claudecode"
    if not root.is_dir():
        fail(f"OMC cache not found at {root}")

    def version_key(path: Path) -> tuple[int, ...]:
        parts = []
        for item in re.split(r"[.-]", path.name):
            parts.append(int(item) if item.isdigit() else 0)
        return tuple(parts)

    versions = [path for path in root.iterdir() if path.is_dir()]
    if not versions:
        fail(f"OMC cache has no version directories under {root}")
    return sorted(versions, key=version_key)[-1]


def ensure_clean_target(path: Path, force: bool) -> None:
    if path.exists() or path.is_symlink():
        if not force:
            fail(f"target already exists: {path} (rerun with --force)")
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path)
        else:
            path.unlink()


def normalize_name(raw: str, *, fallback: str) -> str:
    name = raw or fallback
    if not name.startswith("omc-"):
        name = f"omc-{name}"
    if not KEBAB_RE.fullmatch(name):
        fail(f"unsafe OMC asset name: {name!r}")
    return name


def child_target(root: Path, name: str) -> Path:
    root_resolved = root.resolve()
    target = (root / name).resolve()
    try:
        target.relative_to(root_resolved)
    except ValueError:
        fail(f"target escapes compatibility root: {target}")
    return target


def copy_skill(source: Path, target_root: Path, force: bool) -> str:
    skill_md = source / "SKILL.md"
    fields, body = parse_frontmatter(skill_md.read_text(encoding="utf-8"))
    name = normalize_name(fields.get("name", ""), fallback=source.name)
    fields["name"] = name
    description = fields.get("description") or f"OMC skill {source.name}"
    if not description.startswith("[OMC]"):
        fields["description"] = f"[OMC] {description}"

    target = child_target(target_root, name)
    ensure_clean_target(target, force)
    shutil.copytree(source, target, symlinks=True)
    (target / "SKILL.md").write_text(render_frontmatter(fields, body), encoding="utf-8")
    return name


def copy_agent(source: Path, target_root: Path, force: bool) -> str:
    fields, body = parse_frontmatter(source.read_text(encoding="utf-8"))
    name = normalize_name(fields.get("name", ""), fallback=source.stem)
    fields["name"] = name
    description = fields.get("description") or f"OMC agent {source.stem}"
    if not description.startswith("[OMC]"):
        fields["description"] = f"[OMC] {description}"
    if fields.get("model") and fields["model"] not in {"inherit", "auto"}:
        fields["model"] = "inherit"

    target = child_target(target_root, f"{name}.md")
    ensure_clean_target(target, force)
    shutil.copy2(source, target)
    target.write_text(render_frontmatter(fields, body), encoding="utf-8")
    return name


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Materialize installed OMC assets into Cursor's documented "
            "~/.claude/skills and ~/.claude/agents compatibility directories."
        )
    )
    parser.add_argument("--home", type=Path, default=Path.home())
    parser.add_argument("--source", type=Path, default=None, help="OMC cache version root")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    home = args.home.expanduser().resolve()
    source = (args.source.expanduser().resolve() if args.source else latest_omc_cache(home))
    skills_source = source / "skills"
    agents_source = source / "agents"
    if not skills_source.is_dir():
        fail(f"OMC skills source missing: {skills_source}")
    if not agents_source.is_dir():
        fail(f"OMC agents source missing: {agents_source}")

    skill_targets = sorted(path.parent for path in skills_source.rglob("SKILL.md"))
    agent_targets = sorted(path for path in agents_source.glob("*.md"))
    if not skill_targets:
        fail(f"no OMC skills found under {skills_source}")
    if not agent_targets:
        fail(f"no OMC agents found under {agents_source}")

    user_skills = home / ".claude" / "skills"
    user_agents = home / ".claude" / "agents"
    if args.dry_run:
        print(f"would source OMC assets from {source}")
        print(f"would write {len(skill_targets)} skills to {user_skills}")
        print(f"would write {len(agent_targets)} agents to {user_agents}")
        return 0

    user_skills.mkdir(parents=True, exist_ok=True)
    user_agents.mkdir(parents=True, exist_ok=True)

    skills = [copy_skill(path, user_skills, args.force) for path in skill_targets]
    agents = [copy_agent(path, user_agents, args.force) for path in agent_targets]
    print(f"ok: linked {len(skills)} OMC skills into {user_skills}")
    print(f"ok: linked {len(agents)} OMC agents into {user_agents}")
    print(f"ok: OMC source remained read-only at {source}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
