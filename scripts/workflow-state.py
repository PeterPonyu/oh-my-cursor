#!/usr/bin/env python3
"""Repository wrapper for the shipped workflow-state runtime helper."""
from __future__ import annotations

import runpy
from pathlib import Path


HELPER = Path(__file__).resolve().parents[1] / ".cursor" / "state" / "workflow-state.py"

if __name__ == "__main__":
    runpy.run_path(str(HELPER), run_name="__main__")
