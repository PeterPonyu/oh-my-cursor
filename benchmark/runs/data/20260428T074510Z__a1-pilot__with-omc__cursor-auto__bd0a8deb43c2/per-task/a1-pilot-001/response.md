1. **Introduce OAuth plumbing behind a feature flag (no behavior change yet).**  
   - **File scope:** `config.py` (OAuth client id/secret, redirect URI, scopes, `OAUTH_ENABLED` flag), `.env.example` (new vars), `requirements.txt`/`pyproject.toml` (OAuth library such as Authlib), and a short `docs/auth-migration.md`.  
   - **Rollback consideration:** Keep `OAUTH_ENABLED=false` by default so deployment is a no-op; rollback is simply disabling the flag and removing env vars from runtime config.

2. **Add OAuth routes and callback handling while preserving current session flow.**  
   - **File scope:** `app/auth/routes.py` (or similar blueprint) for `/login/oauth`, `/auth/callback`, `/logout`; `app/__init__.py` for blueprint registration; optional `app/services/oauth_service.py` for token/userinfo exchange logic.  
   - **Rollback consideration:** Do not replace existing `/login` route yet—add parallel routes only. If issues occur, unexpose OAuth login link and keep legacy session login path active.

3. **Map OAuth identities to local users and unify session creation.**  
   - **File scope:** `models.py` + migration (`migrations/versions/*.py`) to add `oauth_provider`, `oauth_subject`, and/or verified email mapping; `app/auth/service.py` to upsert user; existing session creation utility (`login_user` or custom) reused so downstream auth checks stay unchanged.  
   - **Rollback consideration:** Make schema additive (nullable new columns, no destructive changes). If rollback needed, stop using OAuth mapping code and continue authenticating existing local users; new columns can remain unused safely.

4. **Switch UI/default login path and harden operations.**  
   - **File scope:** templates (`templates/login.html`, navbar), frontend login button/link targets, auth tests (`tests/test_auth_oauth.py` + regression tests for legacy session paths), and ops docs/runbooks (redirect URI setup, secret rotation, provider outage behavior).  
   - **Rollback consideration:** Keep dual-login capability for one release window (legacy + OAuth). If incidents arise, revert login button/default route to legacy session login and keep OAuth endpoints disabled via feature flag until fixed.