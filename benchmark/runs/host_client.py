"""cursor-agent CLI invocation wrapper for the benchmark recorder.

Shells out to ``cursor-agent --print --trust --output-format json "<prompt>"``,
parses the JSON result, and returns a normalized dict.

The cwd at invocation determines which Cursor skills auto-load:
  - vanilla arm: cwd is a fresh tempdir with no ``skills/``
  - with-omc arm: cwd is the project root (skills auto-load)
"""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from typing import Any, Optional


class CursorCLIError(RuntimeError):
    """Raised when the cursor-agent call fails."""


def _resolve_binary() -> str:
    binary = shutil.which("cursor-agent")
    if binary is None:
        # Fall back to the canonical install location.
        fallback = "/home/zeyufu/.local/bin/cursor-agent"
        import os
        if os.path.isfile(fallback) and os.access(fallback, os.X_OK):
            return fallback
        raise CursorCLIError(
            "cursor-agent CLI not found on PATH. "
            "Install Cursor Agent or symlink the binary."
        )
    return binary


def build_cursor_command(binary: str, prompt: str, model: Optional[str] = None) -> list[str]:
    """Build the cursor-agent CLI command.

    ``model`` is intentionally explicit for benchmark proof runs. Passing
    ``"auto"`` records and executes ``--model auto`` instead of relying on the
    cursor-agent default.
    """
    cmd = [
        binary,
        "--print",
        "--trust",
        "--output-format", "json",
    ]
    if model:
        cmd += ["--model", model]
    cmd.append(prompt)
    return cmd


def call_cursor(
    prompt: str,
    workdir: str,
    model: Optional[str] = None,
    timeout: float = 180.0,
) -> dict[str, Any]:
    """Single-turn call to the cursor-agent CLI.

    Parameters
    ----------
    prompt : str
        The user prompt.
    workdir : str
        Working directory for the cursor-agent process. This determines
        which skills are auto-discovered (a fresh tempdir for the vanilla
        arm; the OMC repo root for the with-omc arm).
    model : str | None
        Optional model identifier (forwarded as ``--model``). Benchmark runners
        pass ``"auto"`` explicitly so the recorded command proves Cursor auto
        mode rather than relying on an implicit default.
    timeout : float
        Subprocess timeout in seconds.

    Returns
    -------
    dict
        Normalized response with ``content``, ``tokens``, ``raw``,
        ``wallclock_ms``, ``stop_reason``, ``request_body``,
        ``session_id`` and ``request_id`` keys.
    """
    binary = _resolve_binary()

    cmd = build_cursor_command(binary, prompt, model=model)

    request_record = {
        "backend": "cursor_cli",
        "model_arg": model,
        "prompt": prompt,
        "workdir": str(workdir),
        "cmd": list(cmd),
    }

    t0 = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise CursorCLIError(
            f"cursor-agent timed out after {timeout}s (workdir={workdir})"
        ) from exc
    wallclock_ms = int((time.time() - t0) * 1000)

    if not proc.stdout.strip():
        raise CursorCLIError(
            f"cursor-agent returned empty stdout (exit={proc.returncode}). "
            f"stderr={proc.stderr[:400]!r}"
        )

    try:
        parsed = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise CursorCLIError(
            f"cursor-agent returned non-JSON (exit={proc.returncode}): "
            f"{proc.stdout[:300]!r}"
        ) from exc

    if proc.returncode != 0 or parsed.get("is_error"):
        raise CursorCLIError(
            f"cursor-agent reported error (exit={proc.returncode}): "
            f"subtype={parsed.get('subtype')!r} "
            f"result={str(parsed.get('result', ''))[:400]!r}"
        )

    usage = parsed.get("usage") or {}
    tokens = {
        "input": int(usage.get("inputTokens", usage.get("input_tokens", 0)) or 0),
        "output": int(usage.get("outputTokens", usage.get("output_tokens", 0)) or 0),
        "cache_read": int(
            usage.get("cacheReadTokens", usage.get("cache_read_input_tokens", 0)) or 0
        ),
        "cache_write": int(
            usage.get("cacheWriteTokens", usage.get("cache_creation_input_tokens", 0)) or 0
        ),
    }

    return {
        "content": str(parsed.get("result", "")),
        "tokens": tokens,
        "raw": parsed,
        "wallclock_ms": wallclock_ms,
        "stop_reason": parsed.get("subtype", "success"),
        "request_body": request_record,
        "session_id": parsed.get("session_id"),
        "request_id": parsed.get("request_id"),
    }
