I’ll implement this end-to-end directly in the codebase and then report it in the exact phases you asked for, including verification criteria, QA retry budget, and escalation triggers. First I’m checking the project structure to locate the server and an endpoint to gate.I found a small Python service (`app.py`), so I’m reading it now to add an env-var feature flag and gate one existing endpoint cleanly.I’ve confirmed the endpoint is `GET /healthz`; next I’m editing `app.py` to add an env-driven flag and enforce it server-side, then I’ll update `PHASES.md` with your requested phase-by-phase criteria, retry budget, and escalation rules.Implementation is in place; I’m running the phase verification commands now to confirm both enabled and disabled behaviors and validate the retry/escalation policy inputs.Implemented end-to-end: added an env-var driven server-side feature flag and gated an existing endpoint behind it.

### What changed

- Added `is_healthz_enabled()` in `app.py` to read `FEATURE_HEALTHZ_ENABLED` (truthy: `1/true/yes/on`, case-insensitive).
- Gated existing `GET /healthz` endpoint:
  - Flag enabled: unchanged behavior (`{"status":"ok","version":"<sha-or-unknown>"}`).
  - Flag disabled: returns HTTP `404 Not Found`.
- Updated `PHASES.md` to include explicit phases, per-phase verification criteria, bounded QA retry budget, and escalation triggers.

```13:44:app.py
def is_healthz_enabled() -> bool:
    """Return True when health endpoint feature flag is enabled."""
    raw_value = os.getenv("FEATURE_HEALTHZ_ENABLED", "true")
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}

@app.get("/healthz")
def healthz() -> dict[str, str]:
    if not is_healthz_enabled():
        # Hide disabled endpoint as unavailable to callers.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found",
        )
    return {"status": "ok", "version": get_git_sha()}
```

```41:54:PHASES.md
## QA
- Goal: verify feature-flag behavior for enabled/disabled flows with bounded retries.
- Bounded QA retry budget:
  - Maximum retries: **5** cycles.
  - Immediate escalation threshold: same error class/signature repeated **3** times.
...
- Escalation triggers (stop retrying and escalate instead):
  - The same assertion or runtime failure repeats 3 times without code or env-state delta.
  - A dependency/runtime blocker appears (missing package/interpreter) requiring environment intervention.
  - Behavior contract conflict is detected (requested semantics contradict existing API contract).
```

### Phase output (explicit)

- **Expansion**: selected `GET /healthz` as the gated endpoint, defined `FEATURE_HEALTHZ_ENABLED`, and fixed disabled semantics to 404.
- **Planning**: chose helper-based env parsing + inline gate in handler; documented verification matrix.
- **Execution**: implemented flag helper and endpoint guard in `app.py`; preserved existing enabled response contract.
- **QA**: documented executable checks for enabled/disabled/fallback paths in `PHASES.md`.
- **Review**: documented independent review criteria covering correctness, robustness, and contract traceability.
- **Cleanup**: documented final artifact checks and retained only required files.

### Verification run status

- Static verification passed via content checks (`rg`) for:
  - feature flag symbol presence,
  - 404 gate behavior,
  - QA budget + escalation sections.
- Runtime `python3` command execution is blocked in this environment, so live execution checks are documented but not executed here.

### Bounded QA retry budget and escalation policy

- **Retry budget**: up to **5 QA cycles**.
- **Escalate instead of retry** when:
  - same failure signature repeats **3 times** with no meaningful code/env delta,
  - environment/dependency blockers require external intervention,
  - requirement/contract contradiction is detected.