"""Anthropic client for the benchmark recorder.

Two backends, auto-selected:

1. **claude CLI (OAuth-backed)** — used when ``ANTHROPIC_API_KEY`` is NOT set.
   Shells out to ``claude --print --output-format json --model <flat>``,
   inheriting the user's existing Claude Code OAuth credentials. Stable
   non-interactive output, structured JSON with ``modelUsage`` token counts
   and ``total_cost_usd``.

2. **HTTPS Messages API** — used when ``ANTHROPIC_API_KEY`` IS set.
   Direct ``urllib.request`` POST to ``/v1/messages``. Lower per-call
   overhead (no Claude Code system prompt cache_creation tax) but requires
   an explicit API key.

Both backends return the same dict shape so the pilot/recorder layer is
backend-agnostic.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from typing import Any, Optional


ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_API_VERSION = "2023-06-01"


class AnthropicError(RuntimeError):
    """Raised when the Anthropic call fails or no auth path is available."""


def _extract_text(content: Any) -> str:
    if isinstance(content, list):
        parts: list[str] = []
        for blk in content:
            if isinstance(blk, dict) and blk.get("type") == "text":
                parts.append(str(blk.get("text", "")))
            elif isinstance(blk, str):
                parts.append(blk)
        return "\n\n".join(p for p in parts if p)
    if isinstance(content, str):
        return content
    return ""


def _bare_model_id(model: str) -> str:
    """Strip a ``anthropic/`` provider prefix if present."""
    if model.startswith("anthropic/"):
        return model.split("/", 1)[1]
    return model


def _model_alias_for_cli(model: str) -> str:
    """Translate a recorder model id to the value the claude CLI accepts.

    The CLI accepts both short aliases (``haiku``/``sonnet``/``opus``) and
    full ids. We prefer aliases for haiku/sonnet/opus to keep invocations
    forward-compatible.
    """
    bare = _bare_model_id(model)
    if "haiku" in bare:
        return "haiku"
    if "sonnet" in bare:
        return "sonnet"
    if "opus" in bare:
        return "opus"
    return bare


def _call_via_cli(
    model: str,
    system: Optional[str],
    user: str,
    max_tokens: int,
    temperature: float,
    timeout: float,
    max_budget_usd: Optional[float],
) -> dict[str, Any]:
    """Call the local ``claude`` CLI with --print/--output-format json.

    Uses --system-prompt (overrides the default system prompt entirely so
    the vanilla arm is actually vanilla, not "Claude Code's defaults +
    nothing"). --disable-slash-commands prevents skill auto-attach.
    """
    binary = shutil.which("claude")
    if binary is None:
        raise AnthropicError(
            "claude CLI not found on PATH and ANTHROPIC_API_KEY is not set. "
            "Install Claude Code or export ANTHROPIC_API_KEY=sk-ant-..."
        )

    sys_prompt = system if system else "You are a helpful assistant."

    cmd = [
        binary,
        "--print",
        "--output-format", "json",
        "--model", _model_alias_for_cli(model),
        "--system-prompt", sys_prompt,
        "--disable-slash-commands",
    ]
    if max_budget_usd is not None and max_budget_usd > 0:
        cmd += ["--max-budget-usd", f"{float(max_budget_usd):.4f}"]
    cmd.append(user)

    request_record = {
        "backend": "claude_cli",
        "model": model,
        "model_alias": _model_alias_for_cli(model),
        "system": sys_prompt,
        "user": user,
        "max_tokens_hint": int(max_tokens),
        "temperature_hint": float(temperature),
        "max_budget_usd": max_budget_usd,
    }

    t0 = time.time()
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise AnthropicError(f"claude CLI timed out after {timeout}s") from exc
    wallclock_ms = int((time.time() - t0) * 1000)

    if not proc.stdout.strip():
        raise AnthropicError(
            f"claude CLI returned empty stdout (exit={proc.returncode}). "
            f"stderr={proc.stderr[:400]!r}"
        )
    try:
        parsed = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AnthropicError(
            f"claude CLI returned non-JSON (exit={proc.returncode}): {proc.stdout[:200]!r}"
        ) from exc

    if parsed.get("is_error"):
        raise AnthropicError(
            f"claude CLI reported error: {parsed.get('subtype')}: "
            f"{parsed.get('result', '')[:400]} | errors={parsed.get('errors')}"
        )

    model_usage = parsed.get("modelUsage") or {}
    if model_usage:
        first_key = next(iter(model_usage))
        usage_block = model_usage[first_key]
    else:
        usage_block = parsed.get("usage") or {}

    tokens = {
        "input": int(usage_block.get("inputTokens", usage_block.get("input_tokens", 0)) or 0),
        "output": int(usage_block.get("outputTokens", usage_block.get("output_tokens", 0)) or 0),
        "cache_read": int(
            usage_block.get("cacheReadInputTokens", usage_block.get("cache_read_input_tokens", 0)) or 0
        ),
        "cache_write": int(
            usage_block.get("cacheCreationInputTokens", usage_block.get("cache_creation_input_tokens", 0)) or 0
        ),
    }

    return {
        "content": str(parsed.get("result", "")),
        "tokens": tokens,
        "raw": parsed,
        "wallclock_ms": wallclock_ms,
        "stop_reason": parsed.get("stop_reason"),
        "request_body": request_record,
        "cost_usd_reported": float(parsed.get("total_cost_usd", 0) or 0),
    }


def _call_via_https(
    model: str,
    system: Optional[str],
    user: str,
    max_tokens: int,
    temperature: float,
    api_key: str,
    timeout: float,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": _bare_model_id(model),
        "max_tokens": int(max_tokens),
        "temperature": float(temperature),
        "messages": [{"role": "user", "content": user}],
    }
    if system:
        body["system"] = system

    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        ANTHROPIC_API_URL,
        data=data,
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_API_VERSION,
            "content-type": "application/json",
            "accept": "application/json",
        },
    )

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw_bytes = resp.read()
            status = resp.status
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace") if hasattr(exc, "read") else str(exc)
        raise AnthropicError(f"Anthropic API HTTP {exc.code}: {err_body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise AnthropicError(f"Anthropic API network error: {exc.reason}") from exc
    wallclock_ms = int((time.time() - t0) * 1000)

    try:
        parsed = json.loads(raw_bytes.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise AnthropicError(
            f"Anthropic API returned non-JSON (status {status}): {raw_bytes[:200]!r}"
        ) from exc

    usage = parsed.get("usage") or {}
    tokens = {
        "input": int(usage.get("input_tokens", 0) or 0),
        "output": int(usage.get("output_tokens", 0) or 0),
        "cache_read": int(usage.get("cache_read_input_tokens", 0) or 0),
        "cache_write": int(usage.get("cache_creation_input_tokens", 0) or 0),
    }

    return {
        "content": _extract_text(parsed.get("content")),
        "tokens": tokens,
        "raw": parsed,
        "wallclock_ms": wallclock_ms,
        "stop_reason": parsed.get("stop_reason"),
        "request_body": {"backend": "https", **body},
    }


def call_anthropic(
    model: str,
    system: Optional[str],
    user: str,
    max_tokens: int = 1024,
    temperature: float = 0.2,
    api_key: Optional[str] = None,
    timeout: float = 180.0,
    max_budget_usd: Optional[float] = None,
) -> dict[str, Any]:
    """Single-turn call. Auto-selects backend.

    - If ``api_key`` arg or ``ANTHROPIC_API_KEY`` env is set: HTTPS API.
    - Otherwise: shell out to ``claude`` CLI (OAuth).
    """
    key = api_key if api_key is not None else os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return _call_via_https(model, system, user, max_tokens, temperature, key, timeout)
    return _call_via_cli(model, system, user, max_tokens, temperature, timeout, max_budget_usd)
