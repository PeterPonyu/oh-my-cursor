1. **Introduce OAuth config and client wiring (no behavior change yet)**  
   - **File scope:** `config.py`, `.env.example`, `requirements.txt`, and new auth helper module like `app/auth/oauth_client.py`.  
   - Add provider settings (client ID/secret, authorize/token/userinfo URLs, redirect URI), install OAuth library (e.g., Authlib), and initialize client in app factory without routing traffic to it yet.  
   - **Rollback:** Revert dependency and config additions; keep existing session-cookie auth path untouched so app continues with current login flow.

2. **Add OAuth login/callback endpoints alongside existing login routes**  
   - **File scope:** `app/routes/auth.py` (or equivalent auth blueprint), `app/__init__.py` (route registration), optional `app/services/user_identity.py`.  
   - Implement `/auth/oauth/login` and `/auth/oauth/callback`, map OAuth identity to existing user records, then create the same session cookie your current app expects after successful callback. Keep old username/password login active in parallel.  
   - **Rollback:** Disable new OAuth routes via feature flag/config toggle and remove route links; existing login endpoints remain primary.

3. **Update UI and auth guards to support dual-mode authentication**  
   - **File scope:** `templates/login.html`, shared layout templates, `app/auth/decorators.py` or middleware/guards, and related frontend assets.  
   - Add “Continue with OAuth” button and ensure protected-route checks treat OAuth-established sessions exactly like legacy sessions. Preserve legacy login form during transition.  
   - **Rollback:** Hide OAuth button/entry points and revert guard changes to legacy-only checks; sessions created by old flow continue to work.

4. **Cut over safely with tests, observability, and staged deprecation**  
   - **File scope:** `tests/auth/test_oauth_flow.py`, `tests/integration/test_login.py`, logging/metrics config (`app/logging.py` or monitoring config), and deployment config/feature flags.  
   - Add integration tests for login/callback/logout/session persistence, instrument OAuth errors and callback failures, then gradually enable OAuth by environment or percentage while monitoring auth success/failure rates. After stability, deprecate legacy login routes.  
   - **Rollback:** Flip feature flag to return to legacy login as default, keep callback routes dormant, and retain legacy tests/routes until OAuth is proven stable in production.