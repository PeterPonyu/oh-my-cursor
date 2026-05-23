- **OWASP class:** `A02:2021 – Cryptographic Failures`  
  **Severity:** `High`  
  **Attack scenario:** On line `3`, the password is hashed with unsalted `MD5`, which is fast and broken for password storage. If an attacker gets a DB dump, they can crack many hashes quickly using GPU brute force/rainbow tables and reuse recovered passwords across accounts.  
  **Line cited:** `3` (`hashlib.md5(...)`)  
  **Remediation:** Use a password-specific, adaptive KDF with per-password salt (and optional pepper), e.g. `Argon2id` (preferred), `bcrypt`, `scrypt`, or `PBKDF2` with strong parameters. Store the full encoded hash string from the KDF library, not a raw MD5 digest.

No SQL injection issue is evident in line `4` because the query is parameterized.