#!/usr/bin/env python3
"""beforeSubmitPrompt hook: surface workflow-state and skill-routing hints.

Reads the user prompt, scans for repo-owned skill, agent, and phase keywords,
and when an active workflow-state document is reachable (via the
`OH_MY_CURSOR_WORKFLOW_STATE` environment variable or a `workflow_state` field
inside the prompt-submit event) summarizes the current phase and pending
acceptance criteria.

Behavior is intentionally bounded:

- the hook is **fail-open**; it always exits 0 and never blocks a prompt;
- it only emits structured JSON; Cursor decides whether to surface the
  `additional_context` string;
- it does **not** mutate workflow state; it only reads it.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trace import trace as _trace  # noqa: E402

# Resolve ROOT from environment or workspace, not __file__ (which may be unreliable in hook contexts)
ROOT = Path(os.environ.get("OH_MY_CURSOR_WORKSPACE", os.getcwd())).resolve()
if not (ROOT / "hooks").exists() or "plugins/local/oh-my-cursor" in str(ROOT):
    ROOT = Path(__file__).resolve().parents[1]

SKILL_NAMES = {
    "phase-controller", "plan", "auto-execute", "iterate-loop",
    "parallel-batch", "review", "debug", "trace", "security-review",
    "deep-interview", "doctor", "local-plugin-check", "verify", "mcp-setup",
}

AGENT_NAMES = {
    "orchestrator", "researcher", "planner", "implementer", "verifier",
    "critic", "debugger", "security-reviewer",
    "explore", "code-reviewer", "test-engineer", "tracer",
}

PHASE_NAMES = {
    "intake", "research", "plan", "execute",
    "verify", "review", "done", "blocked",
}

PROMPT_FIELDS = ("prompt", "text", "userPrompt", "user_prompt", "message", "content")


def _read_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {"_invalid_json": True}
    return value if isinstance(value, dict) else {"payload": value}


def _extract_prompt(payload: dict) -> str:
    for key in PROMPT_FIELDS:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    nested = payload.get("input")
    if isinstance(nested, dict):
        for key in PROMPT_FIELDS:
            value = nested.get(key)
            if isinstance(value, str) and value.strip():
                return value
    return ""


def _matches(prompt_lower: str, names: set[str]) -> list[str]:
    found: list[str] = []
    for name in names:
        token = re.escape(name)
        if re.search(rf"(?<![A-Za-z0-9_-]){token}(?![A-Za-z0-9_-])", prompt_lower):
            found.append(name)
    return sorted(found)


def _resolve_state_path(payload: dict) -> Path | None:
    candidates: list[str] = []
    env_path = os.environ.get("OH_MY_CURSOR_WORKFLOW_STATE")
    if env_path:
        candidates.append(env_path)
    payload_path = payload.get("workflow_state") if isinstance(payload, dict) else None
    if isinstance(payload_path, str):
        candidates.append(payload_path)
    for raw in candidates:
        try:
            candidate = Path(raw).expanduser()
            if not candidate.is_absolute():
                candidate = (ROOT / candidate).resolve()
            if candidate.is_file():
                return candidate
        except (OSError, RuntimeError, ValueError):
            continue
    return None


def _summarize_state(state_path: Path) -> dict:
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"loaded": False}
    if not isinstance(data, dict):
        return {"loaded": False}
    pending: list[str] = []
    failed: list[str] = []
    criteria = data.get("acceptance_criteria")
    if isinstance(criteria, list):
        for item in criteria:
            if not isinstance(item, dict):
                continue
            status = str(item.get("status", "")).lower()
            label = str(item.get("id") or item.get("criterion") or "").strip()
            if not label:
                continue
            if status == "failed":
                failed.append(label)
            elif status not in {"passed", "skipped"}:
                pending.append(label)
    return {
        "loaded": True,
        "task_id": data.get("task_id"),
        "phase": data.get("phase"),
        "status": data.get("status"),
        "current_role": data.get("current_role"),
        "next_action": data.get("next_action"),
        "pending_criteria": pending[:10],
        "failed_criteria": failed[:10],
    }


def main() -> int:
    payload = _read_payload()
    if payload.get("_invalid_json"):
        print(json.dumps({
            "status": "pass",
            "fail_open": True,
            "additional_context": "",
            "message": "Prompt-router input was not JSON; skipped.",
        }))
        return 0

    prompt = _extract_prompt(payload)
    prompt_lower = prompt.lower()

    matched_skills = _matches(prompt_lower, SKILL_NAMES)
    matched_agents = _matches(prompt_lower, AGENT_NAMES)
    matched_phases = _matches(prompt_lower, PHASE_NAMES)

    state_path = _resolve_state_path(payload)
    state_summary = _summarize_state(state_path) if state_path else {"loaded": False}

    parts: list[str] = []
    if matched_skills:
        parts.append(
            "Skill keywords detected: "
            + ", ".join(matched_skills)
            + ". Matching SKILL.md files live under skills/."
        )
    if matched_agents:
        parts.append(
            "Agent keywords detected: "
            + ", ".join(matched_agents)
            + ". Matching role prompts live under agents/."
        )
    if matched_phases:
        parts.append(
            "Phase keywords detected: "
            + ", ".join(matched_phases)
            + ". phase-controller routes phase transitions; see skills/phase-controller/SKILL.md."
        )
    if state_summary.get("loaded"):
        parts.append(
            "Active workflow state: phase="
            + str(state_summary.get("phase") or "?")
            + ", status="
            + str(state_summary.get("status") or "?")
            + (", role=" + str(state_summary.get("current_role")) if state_summary.get("current_role") else "")
            + "."
        )
        if state_summary.get("failed_criteria"):
            parts.append(
                "Failed acceptance criteria: "
                + ", ".join(state_summary["failed_criteria"])  # type: ignore[arg-type]
                + "."
            )
        if state_summary.get("pending_criteria"):
            parts.append(
                "Pending acceptance criteria: "
                + ", ".join(state_summary["pending_criteria"])  # type: ignore[arg-type]
                + "."
            )
        if state_summary.get("next_action"):
            parts.append("Recorded next action: " + str(state_summary["next_action"]) + ".")

    additional_context = " ".join(parts)
    output = {
        "status": "pass",
        "fail_open": True,
        "additional_context": additional_context,
        "matched_skills": matched_skills,
        "matched_agents": matched_agents,
        "matched_phases": matched_phases,
        "workflow_state": {
            "path": state_path.as_posix() if state_path else None,
            "loaded": state_summary.get("loaded", False),
            "phase": state_summary.get("phase"),
            "status": state_summary.get("status"),
            "current_role": state_summary.get("current_role"),
            "pending_criteria": state_summary.get("pending_criteria", []),
            "failed_criteria": state_summary.get("failed_criteria", []),
        },
    }
    _trace({
        "hook": "prompt-router",
        "event": "beforeSubmitPrompt",
        "status": output.get("status"),
        "prompt_length": len(prompt),
        "matched_skills": matched_skills,
        "matched_agents": matched_agents,
        "matched_phases": matched_phases,
        "state_loaded": state_summary.get("loaded", False),
    })
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
