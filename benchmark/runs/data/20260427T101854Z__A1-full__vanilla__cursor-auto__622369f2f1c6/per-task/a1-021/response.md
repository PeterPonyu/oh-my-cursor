- **OWASP class:** A10:2021 – Server-Side Request Forgery (SSRF)  
  **Severity:** High  
  **Attack scenario:** An attacker supplies `?url=http://169.254.169.254/latest/meta-data/...` (or internal host like `http://localhost:...`) so the server fetches internal/cloud metadata endpoints and returns sensitive data to the attacker.  
  **Line:** `3` (tainted `url` from line `2` flows directly into `fetch`)  
  **Remediation:** Strictly validate and allowlist destinations (scheme/host/port), block private/internal IP ranges and link-local addresses, normalize and re-resolve DNS to prevent bypass, and enforce outbound network egress controls.

- **OWASP class:** A01:2021 – Broken Access Control (proxying internal resources)  
  **Severity:** High (context-dependent)  
  **Attack scenario:** Endpoint acts as an open proxy; unauthenticated users can access resources only the backend can reach (intranet/admin services), bypassing perimeter controls.  
  **Line:** `1-4`  
  **Remediation:** Require authN/authZ for this capability, constrain reachable targets to a minimal business allowlist, and disable generic URL fetching for untrusted users.

- **OWASP class:** A05:2021 – Security Misconfiguration (missing resource limits)  
  **Severity:** Medium  
  **Attack scenario:** Attacker points to a very large/slow response; server reads full body via `r.text()` causing memory/CPU exhaustion (DoS).  
  **Line:** `4`  
  **Remediation:** Add request timeout, max response size, streaming with limits, abort controller, and rate limiting.

- **OWASP class:** A09:2021 – Security Logging and Monitoring Failures (if unmonitored)  
  **Severity:** Medium  
  **Attack scenario:** SSRF probing attempts (`127.0.0.1`, metadata IPs, unusual ports) go undetected without logging/alerting.  
  **Line:** `1-4`  
  **Remediation:** Log target URL decisions (sanitized), blocked attempts, response metadata, and alert on internal-IP/DNS-rebind patterns.