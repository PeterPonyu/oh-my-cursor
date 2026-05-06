from __future__ import annotations

import os
import subprocess
from functools import lru_cache

from fastapi import FastAPI, HTTPException

app = FastAPI()

_TRUE_VALUES = {"1", "true", "yes", "on"}
_FALSE_VALUES = {"0", "false", "no", "off"}
_FEATURE_ENV_PREFIX = "FEATURE_"


def _parse_flag_value(raw_value: str, *, default: bool) -> bool:
    normalized = raw_value.strip().lower()
    if normalized in _TRUE_VALUES:
        return True
    if normalized in _FALSE_VALUES:
        return False
    return default


@lru_cache(maxsize=1)
def _read_feature_flags() -> dict[str, bool]:
    """Read all server-side feature flags from env variables once per process."""
    return {
        "healthz_endpoint": _parse_flag_value(
            os.getenv(f"{_FEATURE_ENV_PREFIX}HEALTHZ_ENDPOINT_ENABLED", "true"),
            default=True,
        ),
    }


def is_feature_enabled(flag_name: str) -> bool:
    """Return whether a named feature flag is enabled."""
    return _read_feature_flags().get(flag_name, False)


@lru_cache(maxsize=1)
def _read_git_sha() -> str:
    """Resolve the current repository git SHA once per process."""
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        sha = "unknown"
    return sha or "unknown"


@app.get("/healthz")
def healthz() -> dict[str, str]:
    if not is_feature_enabled("healthz_endpoint"):
        raise HTTPException(status_code=404, detail="Not Found")
    return {"status": "ok", "version": _read_git_sha()}
