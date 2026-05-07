"""Bridge-side state IO that imports the workflow-state library API.

Loads ``.cursor/state/workflow-state.py`` and ``.cursor/state/_locking.py``
from the active workspace via :mod:`importlib.util` so the bridge and the
CLI shim share a single implementation of every write path (Phase 2 / R6).
The loaded modules are cached in ``sys.modules`` under stable keys so
repeat calls reuse the same module objects (and therefore the same
``file_lock`` callable identity that Phase 5's
``validate-hook-readonly.py --check-shared-lock`` will assert).

This module performs zero ``subprocess`` calls -- the bridge never shells
out to the CLI.  All write tools route through the library API.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

from jail import resolve_jailed


_WORKFLOW_STATE_MODULE_KEY = "_omcs_workflow_state"
_LOCKING_MODULE_KEY = "_omcs_locking"


# ---------------------------------------------------------------------------
# Library loader (imports `.cursor/state/workflow-state.py` once per process)
# ---------------------------------------------------------------------------


def _load_workflow_state(workspace: Path):
    """Load the workflow-state library from the active workspace.

    Returns the cached module on subsequent calls so the import graph
    stays single-rooted (one ``file_lock`` callable identity).
    """
    if _WORKFLOW_STATE_MODULE_KEY in sys.modules:
        return sys.modules[_WORKFLOW_STATE_MODULE_KEY]

    state_dir = workspace / ".cursor" / "state"
    state_path = state_dir / "workflow-state.py"
    if not state_path.is_file():
        raise RuntimeError(f"workflow-state library not found at {state_path}")

    # Make ``_locking`` importable from the loaded module before we run it.
    if str(state_dir) not in sys.path:
        sys.path.insert(0, str(state_dir))

    spec = importlib.util.spec_from_file_location(
        _WORKFLOW_STATE_MODULE_KEY, str(state_path)
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not build module spec for {state_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[_WORKFLOW_STATE_MODULE_KEY] = module
    spec.loader.exec_module(module)
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
    # Validate jail containment before any IO; raises JailError on escape.
    resolve_jailed(workspace, target)
    return target


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
    )
    return _mcp_text(state)
