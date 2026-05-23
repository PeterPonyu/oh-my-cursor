- **Finding:** Unsafe deserialization via `pickle.loads` on untrusted input  
- **OWASP class:** `A08:2021 - Software and Data Integrity Failures` (Insecure Deserialization)  
- **Severity:** **Critical**  
- **Line:** `3` (`return pickle.loads(blob)`)

- **Attack scenario:**  
  An attacker sends a crafted `blob` containing a malicious pickle payload. During `pickle.loads`, Python can execute attacker-controlled code (`__reduce__`/gadget chain), leading to remote code execution on the server, data theft, or full host compromise.

- **Remediation:**  
  - Do **not** use `pickle` for untrusted/user-controlled data.  
  - Replace with a safe format like `json` (or `msgpack` with strict schema validation).  
  - Validate structure and types before use (e.g., schema checks with `pydantic`/`jsonschema`).  
  - If legacy pickle must be supported temporarily, only accept blobs from a strictly trusted source and protect with strong authenticity checks (e.g., HMAC/signatures), but migration off pickle is the real fix.

Safer pattern:

```python
import json

def load_session(blob: bytes):
    data = json.loads(blob.decode("utf-8"))
    # validate expected keys/types here
    return data
```