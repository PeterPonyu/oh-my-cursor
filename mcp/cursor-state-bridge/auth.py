"""Optional auth shake for cursor-state-bridge.

Default mode: OFF.  When the parent process exports
``OH_MY_CURSOR_MCP_TOKEN``, the bridge requires the same value to appear
under ``params.token`` in the ``initialize`` request before accepting
any subsequent request.

This is **defense-in-depth only** -- it does NOT protect against
parent-process compromise.  See ``docs/mcp-auth.md`` for the threat
model.
"""
from __future__ import annotations

import os
from typing import Any


ENV_TOKEN_NAME = "OH_MY_CURSOR_MCP_TOKEN"


def expected_token() -> str | None:
    """Return the configured token, or ``None`` when auth is disabled."""
    raw = os.environ.get(ENV_TOKEN_NAME, "").strip()
    return raw or None


def authenticate(initialize_params: Any) -> bool:
    """Return ``True`` when the ``initialize`` request should be accepted.

    Default behaviour (no token configured): always allow.
    When token configured: the incoming params must contain a matching
    ``token`` field.
    """
    expected = expected_token()
    if expected is None:
        return True
    if not isinstance(initialize_params, dict):
        return False
    return initialize_params.get("token") == expected
