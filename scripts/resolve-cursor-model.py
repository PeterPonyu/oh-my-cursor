#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path


def _load_config(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as exc:
        raise SystemExit(f"FAIL: could not parse {path}: {exc}") from exc
    return value if isinstance(value, dict) else {}


def _parameter_values(config: dict, model_id: str) -> dict[str, str]:
    selected = config.get("selectedModel") or {}
    params = selected.get("parameters") or (config.get("modelParameters") or {}).get(model_id) or []
    values: dict[str, str] = {}
    if isinstance(params, list):
        for item in params:
            if isinstance(item, dict) and item.get("id") is not None:
                values[str(item.get("id"))] = str(item.get("value"))
    return values


def _candidate_models(config: dict) -> list[str]:
    candidates: list[str] = []

    def add(value: object) -> None:
        if isinstance(value, str) and value and value not in candidates:
            candidates.append(value)

    model = config.get("model") or {}
    selected = config.get("selectedModel") or {}
    model_id = str(model.get("modelId") or selected.get("modelId") or "")
    display_model_id = str(model.get("displayModelId") or "")

    add(model_id)
    add(display_model_id)

    values = _parameter_values(config, model_id)
    reasoning = values.get("reasoning", "").replace("_", "-")
    fast = values.get("fast", "").lower() == "true"
    if model_id and reasoning:
        add(f"{model_id}-{reasoning}{'-fast' if fast else ''}")
        add(f"{model_id}-{reasoning}")
    if model_id:
        for suffix in ("extra-high", "xhigh", "high", "medium", "low", "none"):
            add(f"{model_id}-{suffix}{'-fast' if fast else ''}")
            add(f"{model_id}-{suffix}")
    add("auto")
    return candidates


def _list_models() -> str:
    try:
        result = subprocess.run(
            ["cursor-agent", "--list-models"],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return result.stdout or ""


def _listed_model_ids(output: str) -> set[str]:
    ids: set[str] = set()
    for line in output.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("No models available"):
            continue
        # Handles both "model - Display" and plain model-id lines.
        ids.add(re.split(r"\s+-\s+|\s+", stripped, maxsplit=1)[0])
    return ids


def resolve_model(*, config_path: Path, prefer: str = "") -> str:
    if prefer:
        return prefer
    env_model = os.environ.get("CURSOR_SMOKE_MODEL", "").strip()
    if env_model:
        return env_model

    config = _load_config(config_path)
    candidates = _candidate_models(config)
    listed = _listed_model_ids(_list_models())
    if listed:
        for candidate in candidates:
            if candidate in listed:
                return candidate

    # Some Cursor accounts return an empty model list even though a configured
    # model can still be used. In that bounded case, choose the best config
    # candidate and let the caller's actual smoke prove or reject it.
    return candidates[0] if candidates else "auto"


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve a concrete Cursor CLI model for smoke tests.")
    parser.add_argument("--config", type=Path, default=Path.home() / ".cursor" / "cli-config.json")
    parser.add_argument("--prefer", default="")
    args = parser.parse_args()
    print(resolve_model(config_path=args.config.expanduser(), prefer=args.prefer))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
