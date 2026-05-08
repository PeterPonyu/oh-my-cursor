"""Shared payload extractors for Cursor hook scripts.

Cursor surfaces tool-name and file-path fields under several spellings
depending on event and tool kind. These helpers normalize the lookups so
hooks do not each carry an independent copy of the same loop.

Keep stdlib-only; import from any hook script with::

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _tool_payload import extract_tool_name, extract_file_path
"""
from __future__ import annotations


def extract_tool_name(payload: object) -> str:
    """Return the tool name from a Cursor hook payload, or empty string."""
    if not isinstance(payload, dict):
        return ""
    for key in ("tool_name", "toolName", "name"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def extract_file_path(payload: object) -> str:
    """Return the file path a tool is operating on, or empty string."""
    if not isinstance(payload, dict):
        return ""
    tool_input = payload.get("tool_input")
    if isinstance(tool_input, dict):
        for key in ("file_path", "filePath", "path", "notebook_path", "notebookPath"):
            value = tool_input.get(key)
            if isinstance(value, str) and value.strip():
                return value
    for key in ("file_path", "filePath", "path"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""
