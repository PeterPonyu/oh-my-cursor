1) **Route not actually mounted in prod (build/start path mismatch)**
- **Why high prior:** Most common dev/prod drift in Node APIs is different entrypoint (`src/server.ts` vs `dist/server.js`), conditional route registration, or forgotten import in compiled output.
- **Evidence for:**
  - Endpoint works locally with dev runner (`ts-node`, `nodemon`) but not after build/start.
  - Other endpoints may still work (app is up, but one router missing).
  - Prod logs show app startup without expected “mounted route” message.
- **Evidence against:**
  - A route listing/introspection in prod clearly includes that exact path+method.
  - Hitting a sibling route from same router works in prod.
- **Smallest discriminating probe:**
  - Add one startup log in the exact mount file and in the handler file (or temporary `/__routes` dump) in prod artifact; verify the missing endpoint is present in `dist` and mounted at runtime.

2) **Reverse proxy / ingress path rewrite mismatch (Nginx, ALB, API gateway)**
- **Why medium-high prior:** In production, requests usually pass through a proxy that may strip/add prefixes (`/api`, `/v1`) differently than dev.
- **Evidence for:**
  - 404 body/headers look like proxy-generated (not your app’s error shape).
  - Only externally accessed URL fails; direct container/pod localhost call works.
  - Recent infra change: ingress rules, base path, stage mapping, or trailing-slash behavior.
- **Evidence against:**
  - App-level access logs show request reaching Node with expected path and still 404.
  - Same URL path works when bypassing proxy and hitting app directly in prod network.
- **Smallest discriminating probe:**
  - Compare two curls: one to public URL, one directly to app upstream (`localhost`/service DNS). Include `-i` and inspect response server headers + path seen in app logs.

3) **Method/version/strict-routing difference in prod config**
- **Why medium prior:** Prod often enables stricter settings (`case sensitive routing`, `strict routing`, method restrictions, versioned base path via env), while dev is permissive.
- **Evidence for:**
  - `GET /foo` works but `POST /foo` 404 (or `/Foo` vs `/foo`, `/foo/` vs `/foo`).
  - Endpoint depends on env-driven prefix (`API_PREFIX=/api/v1`) present only in prod.
  - Framework differences between dev/prod boot flags (Express/Fastify options).
- **Evidence against:**
  - Exact method + canonical path tested and still missing regardless of slash/case/prefix variants.
  - Routing config is explicitly identical and logged in both environments.
- **Smallest discriminating probe:**
  - Run a 6-request matrix in prod: method (`GET`,`POST`) × path variants (`/x`, `/x/`, case/prefix form) and compare with one-time log of resolved base prefix/routing flags at startup.

If you want, I can turn this into a **10-minute incident checklist** (exact commands/log lines) tailored to Express, Fastify, or Nest.