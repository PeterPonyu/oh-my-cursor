1) **Ingress / reverse-proxy path mismatch (highest prior)**
- **Why likely:** Dev usually hits app directly (`localhost`), while prod often adds Nginx/API Gateway/Ingress with path rewriting (`/api` prefix, trailing slash, basePath).
- **Evidence for:**  
  - 404 only in production.  
  - Endpoint works locally with same app code.  
  - Prod has extra network hop/components not present in dev.
- **Evidence against:**  
  - Other routes with same prefix/rewrite pattern work fine in prod.  
  - Proxy logs show request forwarded to the exact expected upstream path.
- **Smallest discriminating probe:**  
  - Send one request directly to the Node container/service (bypass proxy) and one through public URL, compare `method + path` seen by app logs.  
  - If direct works but proxied fails, root cause is almost certainly proxy/base-path config.

2) **Route not actually registered in production build/runtime**
- **Why likely:** Conditional route loading (`NODE_ENV`, feature flags, dynamic imports, tree-shaken/compiled artifacts) can differ between dev and prod startup.
- **Evidence for:**  
  - 404 returned by app itself (not gateway).  
  - Startup logs in prod lack the route/module registration line.  
  - Route depends on env var or optional module present in dev but absent in prod image.
- **Evidence against:**  
  - Route table dump in prod shows endpoint registered exactly as expected.  
  - Same container image/config in staging works.
- **Smallest discriminating probe:**  
  - Add a temporary boot-time log of registered routes (or one `console.log("route X mounted")`) in prod; redeploy once.  
  - If missing, issue is route-registration/config/build divergence.

3) **HTTP method or canonical path drift (case, slash, version prefix)**
- **Why likely:** Dev testing tools may call `GET /foo`, while prod clients send `POST /foo/` or `/v1/foo`; Express/Fastify matching can differ with strict/case settings or middleware order.
- **Evidence for:**  
  - 404 occurs only for specific clients or only one method.  
  - Access logs show near-match paths (`/users` vs `/user`, `/API/foo` vs `/api/foo`).  
  - Recent client/proxy change introduced version/prefix/trailing slash differences.
- **Evidence against:**  
  - Reproducing with exact prod request (same method/path/headers) against prod still works from curl.  
  - App uses permissive routing and explicit handlers for both variants.
- **Smallest discriminating probe:**  
  - Capture one failing prod request (method + full path) from logs and replay verbatim with `curl -v` against prod and dev.  
  - If only prod fails with same request shape, mismatch is in prod routing/proxy normalization.

If you want, I can also give a **10-minute triage order** (which probe to run first for fastest certainty).