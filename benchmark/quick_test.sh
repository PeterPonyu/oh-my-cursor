#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(python3 "$SCRIPT_DIR/../scripts/resolve-canonical-root.py" "$SCRIPT_DIR/..")"
cd "$ROOT"
python3 benchmark/run_benchmark.py --profile backbone "$@"
