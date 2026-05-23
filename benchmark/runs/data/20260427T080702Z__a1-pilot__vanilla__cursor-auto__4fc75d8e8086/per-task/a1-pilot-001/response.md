I’ll draft a concrete 4-step migration plan with file-by-file scope and rollback notes, and I’ll quickly check the planning skill guidance first so the structure matches your requested output.1. **Introduce OAuth plumbing behind a feature flag**  
   - **File scope:** `config.py` (OAuth client ID/secret, redirect URI, provider discovery URL, `ENABLE_OAUTH_LOGIN`), `.env.example` (new env vars), and app factory (`app/__init__.py`) to initialize OAuth client.  
   - **Rollback consideration:** Keep existing session auth as default path; disable via `ENABLE_OAUTH_LOGIN=false` and redeploy without schema changes.

2. **Add OAuth login/callback routes while preserving current session semantics**  
   - **File scope:** `app/auth/routes.py` (or equivalent auth blueprint) for `/login/oauth` and `/auth/callback`, plus `app/templates/login.html` to add “Sign in with <Provider>” button guarded by flag.  
   - **Rollback consideration:** Routes are additive; remove/hide OAuth button and route registration to instantly revert UX to username/password-only login.

3. **Map OAuth identity to local users and session creation**  
   - **File scope:** `app/models.py` (or `app/models/user.py`) to add provider fields (e.g., `oauth_provider`, `oauth_sub`), migration file under `migrations/versions/`, and `app/auth/service.py` to upsert/link users then create the same Flask session cookie flow used today.  
   - **Rollback consideration:** Use a non-destructive migration (nullable columns, no drops). If rollback needed, stop using new fields first, then run a down migration only after confirming no active dependencies.

4. **Harden, test, and phase rollout**  
   - **File scope:** `tests/auth/test_oauth.py` (success/failure/csrf-state tests), `tests/integration/test_login_flow.py`, and deployment config (`docker-compose.yml`, CI secrets, or platform env settings) for secure secrets and callback URLs.  
   - **Rollback consideration:** Release in stages (dev → staging → partial prod), monitor auth error rate, and keep a one-click rollback playbook: disable feature flag + revert env vars to restore legacy session login immediately.