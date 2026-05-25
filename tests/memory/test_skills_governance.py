"""Assert that every new memory/rules-authoring skill carries the standard
governance, MCP, hooks, and orchestration blocks the repo requires.

The reference skill is ``skills/phase-controller/SKILL.md`` (and its
sibling ``skills/iterate-loop/SKILL.md``). Both have:

  - Frontmatter with ``name`` and ``description`` starting with ``[OMCS]``.
  - A "## Governance" section with three subsections:
      "### Ownership Class", "### Proof Class", "### Claim Summary".
  - An "## MCP Integration Points" section (table or "None").
  - A "## Hooks Dependencies" section (text or "None").
  - An "## Orchestration Role" section (bullet list).

This test enforces the same shape for the five new skills we ship.
"""
from __future__ import annotations

from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SKILLS = ROOT / "skills"

NEW_SKILLS = (
    "remember",
    "notepad",
    "wiki",
    "decisions",
    "rules-authoring",
)

REQUIRED_SECTIONS = (
    "## Governance",
    "### Ownership Class",
    "### Proof Class",
    "### Claim Summary",
    "## MCP Integration Points",
    "## Hooks Dependencies",
    "## Orchestration Role",
)


@pytest.mark.parametrize("skill_name", NEW_SKILLS)
def test_skill_exists(skill_name: str) -> None:
    p = SKILLS / skill_name / "SKILL.md"
    assert p.is_file(), f"{p.relative_to(ROOT)} missing"


@pytest.mark.parametrize("skill_name", NEW_SKILLS)
def test_frontmatter_has_name_and_description(skill_name: str) -> None:
    p = SKILLS / skill_name / "SKILL.md"
    text = p.read_text(encoding="utf-8")
    assert text.startswith("---\n"), f"{p.name} must start with --- frontmatter"
    end = text.find("\n---\n", 4)
    assert end > 0, f"{p.name} frontmatter close marker missing"
    fm = text[4:end]
    assert f"name: {skill_name}" in fm, f"{p.name} frontmatter missing name: {skill_name}"
    assert "description:" in fm, f"{p.name} frontmatter missing description"
    desc_line = next(
        (line for line in fm.splitlines() if line.startswith("description:")),
        "",
    )
    assert "[OMCS]" in desc_line, f"{p.name} description must include [OMCS]"


@pytest.mark.parametrize("skill_name", NEW_SKILLS)
def test_required_sections_present(skill_name: str) -> None:
    p = SKILLS / skill_name / "SKILL.md"
    text = p.read_text(encoding="utf-8")
    missing = [section for section in REQUIRED_SECTIONS if section not in text]
    assert not missing, f"{p.name} missing required sections: {missing}"


@pytest.mark.parametrize("skill_name", NEW_SKILLS)
def test_governance_classes_are_explicit(skill_name: str) -> None:
    """Ownership Class and Proof Class blocks must mention the three
    standard tags so readers can tell at a glance which apply.
    """
    p = SKILLS / skill_name / "SKILL.md"
    text = p.read_text(encoding="utf-8")
    assert "**repo-owned**" in text, f"{p.name} Ownership Class missing repo-owned tag"
    assert "**host-product-only**" in text, f"{p.name} Ownership Class missing host-product-only tag"
    assert "**unsupported-or-out-of-scope**" in text, (
        f"{p.name} Ownership Class missing unsupported-or-out-of-scope tag"
    )
    assert "**official-doc**" in text, f"{p.name} Proof Class missing official-doc tag"
    assert "**checked-in-artifact**" in text, f"{p.name} Proof Class missing checked-in-artifact tag"
    assert "**runtime-smoke**" in text, f"{p.name} Proof Class missing runtime-smoke tag"
