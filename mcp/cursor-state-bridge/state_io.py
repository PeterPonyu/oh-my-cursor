"""Bridge-side state IO that imports the packaged workflow-state API.

The bridge writes workspace runtime JSON files, but it executes only the
package-owned implementation shipped under ``src/oh_my_cursor/workflow_state``.
It never importlib-loads Python from a workspace ``.cursor/state/`` directory.

This module performs zero ``subprocess`` calls -- the bridge never shells out
to the CLI. All write tools route through the library API.
"""
from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path
from typing import Any

from jail import resolve_jailed


_WORKFLOW_STATE_MODULE_KEY = "_omcs_workflow_state"


_PAYLOAD_ROOT = Path(__file__).resolve().parents[2]
_SRC_DIR = _PAYLOAD_ROOT / "src"


# ---------------------------------------------------------------------------
# Library loader (imports package-owned workflow-state API once per process)
# ---------------------------------------------------------------------------


def _load_workflow_state(_workspace: Path):
    """Return the packaged workflow-state API module.

    ``_workspace`` is accepted for the existing handler contract; the
    executable implementation is resolved from the shipped payload, not from
    the runtime workspace.
    """
    if _WORKFLOW_STATE_MODULE_KEY in sys.modules:
        return sys.modules[_WORKFLOW_STATE_MODULE_KEY]

    api_path = _SRC_DIR / "oh_my_cursor" / "workflow_state" / "api.py"
    if not api_path.is_file():
        raise RuntimeError(f"workflow-state package not found at {api_path}")
    if str(_SRC_DIR) not in sys.path:
        sys.path.insert(0, str(_SRC_DIR))

    module = importlib.import_module("oh_my_cursor.workflow_state.api")
    module_file = getattr(module, "__file__", None)
    if module_file is None or Path(module_file).resolve() != api_path.resolve():
        raise RuntimeError(
            "workflow-state API resolved outside the trusted payload: "
            f"{module_file!r}; expected {api_path}"
        )
    sys.modules[_WORKFLOW_STATE_MODULE_KEY] = module
    return module


# ---------------------------------------------------------------------------
# Path resolution helpers
# ---------------------------------------------------------------------------


def _resolve_state_path(workspace: Path, task_id: str | None) -> Path:
    """Return the workflow-state.json path for a ``task_id`` (or default)."""
    if task_id:
        target = workspace / "docs" / "plans" / task_id / "workflow-state.json"
    else:
        target = workspace / ".cursor" / "state" / "workflow-state.json"
    # Validate jail containment before any IO and use the resolved path so
    # writer sidecars are created beside the real jailed state file.
    return resolve_jailed(workspace, target)


def _mcp_text(payload: Any) -> dict[str, Any]:
    """Wrap a Python value into the MCP ``content[].text`` response shape."""
    if isinstance(payload, str):
        text = payload
    else:
        text = json.dumps(payload, ensure_ascii=False)
    return {"content": [{"type": "text", "text": text}]}


# ---------------------------------------------------------------------------
# Tool implementations -- each one resolves the file path inside the jail,
# acquires the shared file_lock via the library API, and returns the
# written state wrapped in the MCP response shape.
# ---------------------------------------------------------------------------


def state_read(workspace: Path, params: dict[str, Any]) -> dict[str, Any]:
    """Read workflow-state.json (or return ``no state`` when absent)."""
    workspace_str = params.get("workspace")
    active_workspace = Path(workspace_str).resolve() if workspace_str else workspace
    target = _resolve_state_path(active_workspace, params.get("task_id"))
    if not target.exists():
        return _mcp_text("no state")
    try:
        parsed = json.loads(target.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"state file parse error: {exc}") from exc
    return _mcp_text(parsed)


_DEFAULT_HISTORY_CAP = 1000


def _history_cap(params: dict[str, Any]) -> int:
    """Extract optional ``history_cap`` from tool params (Phase 7).

    Defaults to 1000 when absent.  Non-int / invalid values fall back to
    the default rather than raise -- the cap is a retention knob, not a
    schema field.
    """
    raw = params.get("history_cap")
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str) and raw.lstrip("-").isdigit():
        try:
            return int(raw)
        except ValueError:
            return _DEFAULT_HISTORY_CAP
    return _DEFAULT_HISTORY_CAP


def state_init(workspace: Path, params: dict[str, Any]) -> dict[str, Any]:
    task_id = params.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        raise ValueError("state_init: task_id is required")
    target = _resolve_state_path(workspace, task_id if params.get("scope_per_task", True) else None)
    library = _load_workflow_state(workspace)
    state = library.init_state(
        target,
        task_id=task_id,
        title=str(params.get("title", "")),
        phase=str(params.get("phase", "intake")),
        status=str(params.get("status", "pending")),
        role=str(params.get("role", "orchestrator")),
        next_action=str(params.get("next_action", "")),
        history_cap=_history_cap(params),
    )
    return _mcp_text(state)


def state_set_phase(workspace: Path, params: dict[str, Any]) -> dict[str, Any]:
    task_id = params.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        raise ValueError("state_set_phase: task_id is required")
    phase = params.get("phase")
    if not isinstance(phase, str) or not phase:
        raise ValueError("state_set_phase: phase is required")
    target = _resolve_state_path(workspace, task_id)
    library = _load_workflow_state(workspace)
    state = library.set_state(
        target,
        phase=phase,
        status=params.get("status") if isinstance(params.get("status"), str) else None,
        role=params.get("role") if isinstance(params.get("role"), str) else None,
        next_action=params.get("next_action") if isinstance(params.get("next_action"), str) else None,
        note=str(params.get("note", "advanced phase via cursor-state-bridge")),
        history_cap=_history_cap(params),
    )
    return _mcp_text(state)


def state_record_failure(workspace: Path, params: dict[str, Any]) -> dict[str, Any]:
    task_id = params.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        raise ValueError("state_record_failure: task_id is required")
    message = params.get("message")
    if not isinstance(message, str):
        message = ""
    retry_count = params.get("retry_count", 0)
    if not isinstance(retry_count, int):
        try:
            retry_count = int(retry_count)
        except (TypeError, ValueError):
            retry_count = 0
    target = _resolve_state_path(workspace, task_id)
    library = _load_workflow_state(workspace)
    state = library.record_failure(
        target,
        type=str(params.get("type", "fixable")),
        message=message,
        retry_count=retry_count,
        note=str(params.get("note", "")),
        history_cap=_history_cap(params),
    )
    return _mcp_text(state)


def state_update_acceptance_criterion(workspace: Path, params: dict[str, Any]) -> dict[str, Any]:
    """Add or update an acceptance criterion.  Evidence stays OPTIONAL (R4)."""
    task_id = params.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        raise ValueError("state_update_acceptance_criterion: task_id is required")
    ac_id = params.get("ac_id")
    if not isinstance(ac_id, str) or not ac_id:
        raise ValueError("state_update_acceptance_criterion: ac_id is required")
    status = params.get("status")
    if not isinstance(status, str) or not status:
        raise ValueError("state_update_acceptance_criterion: status is required")
    target = _resolve_state_path(workspace, task_id)
    library = _load_workflow_state(workspace)
    state = library.update_acceptance_criterion(
        target,
        ac_id=ac_id,
        status=status,
        criterion=params.get("criterion") if isinstance(params.get("criterion"), str) else None,
        evidence=params.get("evidence") if isinstance(params.get("evidence"), str) else None,
        note=str(params.get("note", "")),
        history_cap=_history_cap(params),
    )
    return _mcp_text(state)


def state_history_append(workspace: Path, params: dict[str, Any]) -> dict[str, Any]:
    """Append a free-form history entry without mutating top-level fields."""
    task_id = params.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        raise ValueError("state_history_append: task_id is required")
    note = params.get("note") or params.get("event")
    if not isinstance(note, str) or not note:
        raise ValueError("state_history_append: note (or event) is required")
    target = _resolve_state_path(workspace, task_id)
    library = _load_workflow_state(workspace)
    state = library.append_history(
        target,
        note=note,
        phase=params.get("phase") if isinstance(params.get("phase"), str) else None,
        status=params.get("status") if isinstance(params.get("status"), str) else None,
        history_cap=_history_cap(params),
    )
    return _mcp_text(state)
