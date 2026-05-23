I’ll draft a concise 4-step migration plan with explicit file scope and rollback notes; first I’m quickly checking the planning skill guidance to align with your environment conventions.1. **Introduce OAuth config and dependency wiring (no auth flow switch yet).**  
   - **File scope:** `requirements.txt` (or `pyproject.toml`), app config module (`config.py` or `app/config.py`), environment template (`.env.example`), startup factory (`app/__init__.py`).  
   - **Rollback consideration:** keep existing session-cookie login as default; rollback is removing new OAuth deps/config vars and redeploying with OAuth feature flag off.

2. **Add OAuth blueprint/routes and token-to-user mapping in parallel with current login.**  
   - **File scope:** new auth routes (`app/auth/oauth_routes.py`), auth blueprint registration (`app/auth/__init__.py`), user model/service (`app/models/user.py`, `app/services/auth_service.py`), optional migration for provider identity fields (`migrations/*`).  
   - **Rollback consideration:** keep legacy `/login` and password flow untouched; rollback by un-registering OAuth blueprint and ignoring provider fields (do not drop columns yet).

3. **Unify session creation path so OAuth users still end in current session-cookie model.**  
   - **File scope:** existing session/login utilities (`app/auth/session.py`, `app/auth/routes.py`), login-required middleware/decorators, CSRF/state validation helpers, templates (`templates/login.html`) for “Sign in with …” button.  
   - **Rollback consideration:** gate new OAuth callback-to-session code behind a config flag (`OAUTH_ENABLED`); rollback is toggling flag false so only legacy session login executes.

4. **Cut over gradually with tests, monitoring, then optional legacy deprecation.**  
   - **File scope:** test suite (`tests/auth/test_oauth.py`, `tests/auth/test_session_login.py`), observability/logging config, deployment manifests/secrets, docs/runbook (`README.md`, `docs/auth.md`).  
   - **Rollback consideration:** run dual-path in production first; if failures spike, disable `OAUTH_ENABLED` and keep old login active. Only remove legacy password routes in a later release after stable metrics and a backout window.