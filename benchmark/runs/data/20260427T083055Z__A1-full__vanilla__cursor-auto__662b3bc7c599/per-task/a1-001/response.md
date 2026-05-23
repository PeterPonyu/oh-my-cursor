I’ll outline a concise 4-step migration plan with explicit file scope and rollback notes; first I’m loading the planning skill instructions so I can follow your environment’s expected format.1. **Introduce OAuth plumbing behind a feature flag**  
   - **File scope:** `config.py` (OAuth client IDs/secrets, redirect URI, `OAUTH_ENABLED`), `.env.example` (new env vars), `requirements.txt` (add `Authlib` or equivalent).  
   - **Rollback consideration:** Keep `OAUTH_ENABLED=false` as default so deploy is no-op; rollback is immediate by toggling flag off and removing new env vars from runtime config.

2. **Add OAuth routes and callback handling alongside existing session login**  
   - **File scope:** `app/auth/routes.py` (or `views/auth.py`) for `/login/oauth`, `/oauth/callback`, `/logout`; `app/__init__.py` (register blueprint + client init).  
   - **Rollback consideration:** Do not remove existing username/password endpoints yet; rollback is routing users back to current login path and disabling OAuth routes via flag.

3. **Map OAuth identity to local user/session model**  
   - **File scope:** `app/models.py` (fields like `oauth_provider`, `oauth_sub`, optional migration), `app/auth/service.py` (find-or-create user), existing session helper (`login_user`/`session[...]`) to preserve cookie-based session issuance after OAuth success.  
   - **Rollback consideration:** Make DB changes additive and nullable; if issues arise, keep new columns unused and continue authenticating via legacy flow without destructive schema rollback.

4. **Cut over UI + enforce and verify, then retire legacy login**  
   - **File scope:** `templates/login.html` (OAuth button + fallback), `app/auth/routes.py` (guard legacy login by flag), tests in `tests/auth/test_oauth.py` + smoke tests for session continuity.  
   - **Rollback consideration:** Run dual-path period first (both login methods active); if failures occur, flip traffic back to legacy-only UI/route and keep OAuth code dormant until fixes are validated.