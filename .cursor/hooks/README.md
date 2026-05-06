# Cursor project hooks

This directory contains repo-owned runtime helpers for trusted Cursor
workspaces. The project hook manifest lives at `.cursor/hooks.json` and points
to the Python scripts in this directory.

The hooks are intentionally conservative:

- `claim-proof-audit.py` inspects edited public files for overclaims and legacy
  comparison language, then emits JSON diagnostics. It exits successfully for
  ordinary warnings and only blocks severe unsupported claims.
- `completion-summary-audit.py` reads stop-event JSON and can add a short
  reminder to verify acceptance criteria and avoid unsupported runtime claims.
  It does not request another turn by default.

Both scripts use only the Python standard library so local validation stays
portable.
