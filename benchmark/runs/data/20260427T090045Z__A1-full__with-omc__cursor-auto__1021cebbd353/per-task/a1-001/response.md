1. **Introduce OAuth configuration and client wiring (no behavior change yet)**  
   - **File scope:** `config.py`, `requirements.txt` (or `pyproject.toml`), app factory/init file like `app/__init__.py`, and a new auth integration module such as `app/auth/oauth_client.py`.  
   - **What to do:** Add provider metadata (client ID/secret, authorize/token/userinfo URLs, scopes, redirect URI), install OAuth library (e.g., Authlib), and initialize the client in app startup behind a feature flag (e.g., `OAUTH_ENABLED=False` by default).  
   - **Rollback consideration:** Keep existing session-login flow untouched and default feature flag off; rollback is just disabling `OAUTH_ENABLED` and/or reverting dependency/config changes.

2. **Add OAuth login/callback routes and identity mapping**  
   - **File scope:** `app/routes/auth.py` (or equivalent auth blueprint), `app/models.py` (or user service), optional migration file if adding OAuth columns (`oauth_provider`, `oauth_subject`).  
   - **What to do:** Create `/auth/oauth/login` and `/auth/oauth/callback`; exchange code for tokens; fetch user profile; map external identity to local user (link existing account by verified email or create new user record per policy); then establish the same Flask session cookie your app already uses after successful OAuth auth.  
   - **Rollback consideration:** Keep password/session endpoints active in parallel; if issues occur, disable OAuth routes via blueprint registration flag and users continue with legacy login.

3. **Update login UI and auth guards for dual-mode operation**  
   - **File scope:** login templates (`templates/login.html`), frontend auth components, route decorators/guards, and tests (`tests/test_auth_*`).  
   - **What to do:** Add “Continue with <Provider>” button, preserve existing form login during migration, and ensure post-login redirects/session handling stay consistent regardless of auth method. Add tests for success/failure callback paths and session creation.  
   - **Rollback consideration:** UI-level rollback is low risk: hide OAuth button with config switch while retaining legacy login form; no schema rollback needed if DB changes are additive.

4. **Cut over gradually and harden operations**  
   - **File scope:** environment/deploy manifests (`.env`, `docker-compose.yml`, CI secrets config), observability/logging config, runbooks/docs (`README.md`, `docs/auth-migration.md`).  
   - **What to do:** Enable OAuth in staging first, validate token/callback errors and account-link edge cases, then roll out to production with phased exposure (internal users first, then full). Add monitoring for login success rate, callback failures, and session creation failures; document incident procedures and secret rotation.  
   - **Rollback consideration:** Use a fast config toggle to revert to legacy login-only mode; keep legacy auth code/path for one release window so rollback does not require hotfix coding or emergency DB rollback.