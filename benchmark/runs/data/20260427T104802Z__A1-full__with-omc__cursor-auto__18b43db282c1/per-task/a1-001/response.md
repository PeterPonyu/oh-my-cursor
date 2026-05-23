1. **Introduce OAuth config and dependency wiring (no behavior change yet).**  
   - **File scope:** `requirements.txt` (or `pyproject.toml`), `config.py`, `.env.example`, app factory module such as `app/__init__.py`.  
   - **What to do:** Add OAuth client library (e.g., Authlib), define provider settings (client ID/secret, authorize/token endpoints, callback URL), and load them via environment variables. Keep existing session-cookie auth fully intact.  
   - **Rollback:** Revert dependency/config additions and unset new env vars; since no login flow is switched yet, auth behavior returns immediately to current state.

2. **Add OAuth routes and callback handling alongside existing login routes.**  
   - **File scope:** auth blueprint/module like `app/auth/routes.py`, optional helper module `app/auth/oauth.py`, templates such as `templates/login.html`.  
   - **What to do:** Add `/auth/oauth/login` and `/auth/oauth/callback` routes, validate state/nonce, exchange code for tokens, map provider identity to local user, then create the same session your app already uses (`session['user_id']`, etc.). Keep username/password login route available in parallel.  
   - **Rollback:** Feature-flag or remove only the new OAuth endpoints/UI button; existing session-based login route remains the primary path.

3. **Unify user identity/session model and persistence updates.**  
   - **File scope:** user model (`app/models/user.py`), auth service layer, migration scripts (`migrations/versions/*.py`), possibly `app/db.py`.  
   - **What to do:** Add provider fields (e.g., `oauth_provider`, `oauth_subject`, optional `email_verified`), implement “find-or-create/link account” logic, and ensure session creation/refresh/logout works identically for local and OAuth logins.  
   - **Rollback:** Keep schema changes backward-compatible (nullable new columns, no destructive drops). If issues arise, disable OAuth code path and continue with local users while leaving additive columns in place until safe cleanup.

4. **Cut over safely with staged rollout, monitoring, and deprecation plan.**  
   - **File scope:** feature flags (`config.py`), auth templates, tests (`tests/auth/*`), observability/logging config, deployment manifests.  
   - **What to do:** Gate OAuth with a flag, deploy to staging, run integration tests for login/callback/logout/session expiry, then enable for a small cohort before full rollout. After stability, optionally retire password login.  
   - **Rollback:** Flip the feature flag off (fastest path), hide OAuth UI, and route all users back to existing session-cookie login. Keep old local-login code until metrics/error rates confirm stable OAuth operation.