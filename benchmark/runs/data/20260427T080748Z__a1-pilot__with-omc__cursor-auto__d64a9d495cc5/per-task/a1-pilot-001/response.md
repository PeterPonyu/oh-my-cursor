1. **Introduce OAuth config + dependency plumbing**  
   - **What to do:** Add an OAuth client library (e.g., `Authlib`), define provider settings (client ID/secret, auth/token URLs, redirect URI), and load them from environment variables. Keep existing session auth untouched for now.  
   - **File scope:** `requirements.txt` (or `pyproject.toml`), app config module (e.g., `config.py`), `.env.example`, deployment/env docs.  
   - **Rollback consideration:** Safe to revert by removing the new dependency and config keys; no user-facing behavior changes yet.

2. **Add OAuth routes and callback handling behind a feature flag**  
   - **What to do:** Implement `/auth/login` (redirect to provider) and `/auth/callback` (exchange code, validate token/user info), then create/update local user session on success. Gate new endpoints/UI entry behind `OAUTH_ENABLED` so password/session login remains primary.  
   - **File scope:** auth blueprint/routes (e.g., `auth/routes.py`), app factory/router registration (e.g., `app/__init__.py`), login template/button (e.g., `templates/login.html`).  
   - **Rollback consideration:** Disable `OAUTH_ENABLED` to instantly fall back to legacy login without code removal.

3. **Map OAuth identities to local users and harden session/security behavior**  
   - **What to do:** Add user identity linkage (provider + subject ID), first-login provisioning rules, and conflict handling for existing accounts. Ensure session fixation protection, CSRF/state validation, secure cookie settings, and clear error paths.  
   - **File scope:** models/migrations (e.g., `models.py`, Alembic migration), auth service layer (e.g., `auth/service.py`), security utilities/middleware, error templates/messages.  
   - **Rollback consideration:** Keep schema migration reversible (drop nullable OAuth columns/table link on downgrade). If issues occur, keep OAuth disabled and continue using existing session login.

4. **Cutover, test, and monitor with staged rollout**  
   - **What to do:** Add tests (unit + integration for callback, token failure, account linking), update runbooks, and enable OAuth gradually (internal users → percentage rollout → full). Keep legacy login available for one release window, then deprecate if stable.  
   - **File scope:** test suite (`tests/auth/test_oauth.py`, fixtures), CI config, operational docs (`README`, `docs/auth.md`), feature flag/default env config.  
   - **Rollback consideration:** Immediate rollback via feature flag + provider credential disable; preserve legacy login path until post-stabilization metrics (login success rate, error rate) are acceptable.