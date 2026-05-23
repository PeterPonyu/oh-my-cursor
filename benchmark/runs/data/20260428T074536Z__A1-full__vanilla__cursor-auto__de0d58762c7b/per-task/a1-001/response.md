I’ll draft a concise 4-step migration plan with explicit file scope and rollback strategy, and I’m quickly checking the planning skill guidance first to align the format.1. **Introduce OAuth config and dependency wiring**  
   - **File scope:** `requirements.txt` (add OAuth client lib), `config.py` or `.env` loader (client ID/secret, redirect URI, scopes), app factory file like `app/__init__.py` (register OAuth client).  
   - **Rollback consideration:** Keep existing session auth untouched and guard OAuth with `OAUTH_ENABLED=false`; if issues arise, disable the flag and redeploy without reverting user session behavior.

2. **Add OAuth login/callback routes in parallel with current login flow**  
   - **File scope:** auth routes module such as `app/auth/routes.py` (new `/login/oauth` + `/auth/callback`), optional `app/auth/service.py` (token exchange/userinfo mapping), URL registration in `app/__init__.py`.  
   - **Rollback consideration:** Keep existing `/login` username/password route as default; if callback errors or provider outage occur, remove OAuth button/link and route traffic back to legacy login only.

3. **Bridge OAuth identity to existing session model**  
   - **File scope:** user model/store (`app/models.py` or `app/users/repo.py`) to map provider `sub`/email to local user, session creation logic (`app/auth/session.py` or `flask_login` integration), DB migration file (nullable `oauth_provider`, `oauth_subject` columns).  
   - **Rollback consideration:** Make schema changes additive (nullable + no destructive changes) and avoid deleting password auth fields; rollback by ignoring new OAuth columns and continuing legacy session issuance.

4. **Switch UX and harden operations with staged rollout**  
   - **File scope:** login template (`templates/login.html`) to surface OAuth button, tests (`tests/auth/test_oauth.py`, regression tests for existing session login), observability/config docs (`README.md`, runbook) for token/callback failures.  
   - **Rollback consideration:** Use phased rollout (internal users first, then percentage-based if possible); keep feature flag to instantly revert UI and route exposure, and monitor auth error rates to trigger automatic fallback to legacy login.