1. **Route not actually mounted in production build/runtime** *(highest prior)*  
   - **Why likely:** Very common when dev and prod bootstrap paths differ (e.g., dev loads `src` with `ts-node`, prod runs `dist` where route file wasn’t compiled/exported, or conditional mount behind `NODE_ENV`/feature flag).  
   - **Evidence for:**  
     - Endpoint works locally in dev server but *all* calls to that path are 404 in prod.  
     - Other endpoints may still work, suggesting app is up but missing this route registration.  
     - Recent deploy changed build config, imports, or route index wiring.  
   - **Evidence against:**  
     - Prod logs show handler-level logs for this endpoint being hit (then it’s not a true routing miss).  
     - Route appears in a runtime route dump in prod.  
   - **Smallest discriminating probe:**  
     - Add a one-line startup log (or temporary `/__routes` debug endpoint) listing registered routes in **prod**; verify this path is present exactly as expected.

2. **Reverse proxy / ingress path rewrite mismatch** *(second highest prior)*  
   - **Why likely:** Nginx/API gateway/ALB/CloudFront often prepend/strip prefixes differently in prod; dev usually hits Node directly.  
   - **Evidence for:**  
     - 404 only when calling through public domain, but direct container/pod port works.  
     - Endpoint path includes version/prefix (`/api/v1/...`) that might be rewritten incorrectly.  
     - Recent infra change (ingress rules, gateway config, basePath).  
   - **Evidence against:**  
     - Requests reach Node with the expected `req.originalUrl` and still 404.  
     - Other routes with same prefix succeed through the same proxy path chain.  
   - **Smallest discriminating probe:**  
     - Send the same request to Node service directly (bypass proxy) and compare with edge request; also log `req.originalUrl` in prod for one request.

3. **HTTP method or trailing-slash/case mismatch exposed by prod clients** *(third prior)*  
   - **Why likely:** Express/Fastify matching can be strict depending on config; prod client/CDN may send `GET` vs `POST`, `/foo/` vs `/foo`, or case variations. Dev testing tools often use the “right” shape.  
   - **Evidence for:**  
     - 404 occurs only from specific client/app version, not from manual curl using expected method/path.  
     - Access logs show same path with differing method/slash/case.  
   - **Evidence against:**  
     - 404 reproduces even with exact known-good curl command from prod environment.  
     - Router configured to be non-strict and method matches confirmed.  
   - **Smallest discriminating probe:**  
     - From prod network, run 2–4 curl variants (method + trailing slash + exact casing) and inspect which one hits; this quickly separates matcher issues from infra issues.

If you want, I can turn this into a **10-minute triage runbook** (exact curl commands + log lines to add) so you can narrow to one hypothesis fast.