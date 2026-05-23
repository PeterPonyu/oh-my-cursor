- **High — Insecure deserialization (`pickle.loads`) allows arbitrary code execution**  
  - **OWASP class:** A08:2021 - Software and Data Integrity Failures (unsafe deserialization)  
  - **Severity:** High  
  - **Line:** `3` (`return pickle.loads(blob)`)  
  - **Attack scenario:** An attacker supplies a crafted `blob` (for example via cookie, API field, cache poisoning, or message queue). When `load_session()` calls `pickle.loads`, Python may execute attacker-controlled gadget code during object reconstruction, leading to remote code execution on the server.  
  - **Remediation:** Do not deserialize untrusted data with `pickle`. Use a safe format like JSON (`json.loads`) with strict schema/type validation, signed session tokens (e.g., HMAC/JWT with verified claims), and allowlist-based parsing if complex objects are needed.

If you want, I can provide a drop-in safe rewrite of `load_session()` using JSON + schema validation.