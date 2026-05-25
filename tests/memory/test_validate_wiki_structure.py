"""Pytest coverage for scripts/validate-wiki-structure.py."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "validate-wiki-structure.py"


CLEAN_INDEX = "# Wiki index\n\n## Pages\n- [[overview]]\n"
CLEAN_LOG = (
    "# Wiki log\n\n"
    "2026-05-20T15:00:00Z  add     overview  initial\n"
    "2026-05-20T16:00:00Z  update  overview  follow-up\n"
)
CLEAN_PAGE = (
    "---\n"
    "slug: overview\n"
    "title: Overview\n"
    "created: 2026-05-20\n"
    "updated: 2026-05-20\n"
    "tags: []\n"
    "---\n\n"
    "# Overview\n\n## Summary\n\nOne paragraph.\n"
)


def _seed_wiki(root: Path) -> Path:
    wiki = root / "wiki"
    wiki.mkdir()
    (wiki / "index.md").write_text(CLEAN_INDEX, encoding="utf-8")
    (wiki / "log.md").write_text(CLEAN_LOG, encoding="utf-8")
    (wiki / "overview.md").write_text(CLEAN_PAGE, encoding="utf-8")
    return wiki


def _run(target: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(target)],
        capture_output=True,
        text=True,
    )


def test_self_test_passes() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--self-test"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "VALIDATE_WIKI_STRUCTURE_SELF_TEST_OK" in result.stdout


def test_clean_wiki_passes(tmp_path: Path) -> None:
    wiki = _seed_wiki(tmp_path)
    assert _run(wiki).returncode == 0


def test_missing_index_fails(tmp_path: Path) -> None:
    wiki = _seed_wiki(tmp_path)
    (wiki / "index.md").unlink()
    result = _run(wiki)
    assert result.returncode == 1
    assert "wiki index missing" in result.stderr


def test_out_of_order_log_fails(tmp_path: Path) -> None:
    wiki = _seed_wiki(tmp_path)
    (wiki / "log.md").write_text(
        "# Wiki log\n\n"
        "2026-05-20T16:00:00Z  update  overview  second\n"
        "2026-05-20T15:00:00Z  add     overview  first\n",
        encoding="utf-8",
    )
    result = _run(wiki)
    assert result.returncode == 1
    assert "not sorted non-decreasing" in result.stderr


def test_page_missing_frontmatter_fails(tmp_path: Path) -> None:
    wiki = _seed_wiki(tmp_path)
    (wiki / "no-frontmatter.md").write_text("# Just a body\n", encoding="utf-8")
    result = _run(wiki)
    assert result.returncode == 1
    assert "missing frontmatter" in result.stderr


def test_oversized_page_fails(tmp_path: Path) -> None:
    wiki = _seed_wiki(tmp_path)
    big = CLEAN_PAGE.replace("One paragraph.", "x" * (11 * 1024))
    (wiki / "huge.md").write_text(big, encoding="utf-8")
    result = _run(wiki)
    assert result.returncode == 1
    assert "cap is 10240" in result.stderr
