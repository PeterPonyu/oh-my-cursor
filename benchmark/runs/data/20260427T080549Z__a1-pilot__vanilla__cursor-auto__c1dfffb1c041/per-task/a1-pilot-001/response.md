1. **Introduce OAuth config and dependencies (no behavior change yet)**  
   - **File scope:** `requirements.txt` (or `pyproject.toml`), `config.py` / environment loading module, `.env.example`, optional `docs/auth.md`.  
   - **What to do:** Add OAuth client library (e.g., Authlib), define provider settings (`CLIENT_ID`, `CLIENT_SECRET`, authorize/token/userinfo URLs), and add feature flag like `AUTH_MODE=session|oauth-hybrid|oauth-only`.  
   - **Rollback consideration:** Safe, low-risk rollback by removing new deps/env keys and setting `AUTH_MODE=session`; no user-impacting routes changed yet.

2. **Add OAuth login/callback/logout endpoints alongside existing session auth (hybrid mode)**  
   - **File scope:** `app/routes/auth.py` (or equivalent auth blueprint), `app/__init__.py` route registration, `app/templates/login.html` (add “Login with X” button), optional `app/services/oauth.py`.  
   - **What to do:** Implement `/auth/oauth/login`, `/auth/oauth/callback`, `/auth/oauth/logout`; on callback, map OAuth identity to local user and then continue issuing your existing session cookie to minimize downstream changes. Keep current username/password flow active.  
   - **Rollback consideration:** Disable OAuth button and routes via `AUTH_MODE=session`; existing session login still works, so rollback is mostly config-only.

3. **Unify user identity/session handling and authorization checks**  
   - **File scope:** `app/models.py` (user fields for provider/sub), auth helpers (`app/auth.py`, decorators), `app/routes/*` where `current_user`/session is read, migration files if schema changes are needed.  
   - **What to do:** Standardize post-login identity object so both legacy and OAuth paths populate the same session keys/user context; add account-linking policy (first login, duplicate email, disabled user). Add tests for protected routes under both auth paths.  
   - **Rollback consideration:** Keep schema changes backward compatible (nullable new columns, no destructive drops). If issues arise, route all logins back to legacy path while retaining new columns unused.

4. **Cut over gradually to OAuth-first, then OAuth-only after validation**  
   - **File scope:** `app/templates/login.html`, auth config toggles, monitoring/logging config, test suite/CI auth tests, runbook docs.  
   - **What to do:** Move to `oauth-hybrid` first (OAuth default, legacy fallback), monitor login success/error rates, then switch to `oauth-only` once stable. Add operational metrics and alerting for callback failures/token exchange errors.  
   - **Rollback consideration:** Use staged flags for instant rollback (`oauth-only -> oauth-hybrid -> session`). Keep legacy login code for one release window before final removal to ensure fast recovery.