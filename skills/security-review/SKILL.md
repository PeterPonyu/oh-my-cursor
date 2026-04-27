---
name: security-review
description: OWASP-aligned security pass for a diff or codebase, with severity ratings and remediation steps.
---

# Security Review

> **Cursor host note.** This skill runs inside the Cursor agent against the
> workspace; it does not assume any orchestration primitive Cursor has not
> documented. Findings are written into the chat (and optionally to
> `docs/security/<date>-<slug>.md` if the user wants a checked-in record).
> Pair with the `review` skill for a full quality + security pass.

## Use when

- New code handles untrusted input, authentication, or secrets.
- You added or upgraded a dependency.
- Before deploying to a shared environment.
- A teammate asked for a security audit.

## Skip when

- The change is documentation only.
- The change is a typo or formatting fix.
- The change is internal-only refactoring with no input/output surface change.

## Workflow

1. **Define scope.** `git diff` for a branch, or a specific path the user
   names. State scope before scanning.
2. **OWASP Top 10 sweep** (see checklist below).
3. **Secrets sweep** of the diff.
4. **Input validation sweep** for any endpoint, parser, or shell call.
5. **Dependency check** if `package.json`, `pyproject.toml`,
   `Cargo.toml`, or similar manifests changed. Run the platform's audit
   command (e.g. `npm audit --audit-level=high`) and report results faithfully.
6. **Write the report** with severity, file:line, OWASP reference, and a
   concrete remediation.
7. **Final assessment** ("safe to merge", "fix CRITICAL/HIGH first",
   "do not deploy").

## OWASP Top 10 checklist

- A01 Broken Access Control - missing authorization on protected resources.
- A02 Cryptographic Failures - weak hashing, broken algorithms, missing TLS.
- A03 Injection - SQL, NoSQL, command, LDAP, prompt.
- A04 Insecure Design - workflow that cannot be made safe by config alone.
- A05 Security Misconfiguration - default credentials, verbose errors.
- A06 Vulnerable / outdated components - dependency CVEs.
- A07 Identification and Authentication Failures - weak session handling.
- A08 Software and Data Integrity - unsigned updates, unsafe deserialization.
- A09 Logging and Monitoring Failures - silent failure of security events.
- A10 Server-Side Request Forgery - user-controlled URLs in server fetches.

## Severity rubric

| Severity | Meaning |
|----------|---------|
| CRITICAL | Exploitable now, severe impact (RCE, secret leak, data breach). |
| HIGH | Exploitable with specific conditions, serious impact. |
| MEDIUM | Real weakness, limited blast radius or harder to exploit. |
| LOW | Best-practice violation; not directly exploitable. |

## Report format

```
SECURITY REVIEW REPORT
======================

Scope: <files or branch>
Date: <YYYY-MM-DD>

CRITICAL (<n>)
--------------
- <path>:<line> - <finding>
  Impact: <what an attacker can do>
  Remediation: <concrete fix>
  OWASP: A0X:2021 - <category>

HIGH / MEDIUM / LOW
-------------------
(same format)

DEPENDENCIES
------------
- <package>@<version> - <CVE> (<severity>)
  Fix: upgrade to <version>

OVERALL ASSESSMENT
------------------
Posture: GOOD | ACCEPTABLE | POOR
Immediate actions: <list>
Recommendation: SAFE TO MERGE | FIX HIGH+ FIRST | DO NOT DEPLOY
```

## Remediation priority

1. Rotate any exposed secret immediately (within 1 hour).
2. Fix `CRITICAL` within 24 hours.
3. Fix `HIGH` within 1 week.
4. Schedule `MEDIUM` within the current sprint.
5. Backlog `LOW`.

## Boundaries

- This skill is read-only; it does not auto-fix vulnerabilities. To fix and
  re-verify in a loop, layer it under `iterate-loop`.
- It does not fetch external CVE databases. It uses whatever audit tool the
  project already provides; if no audit tool exists, the dependency section
  becomes "no audit tool available" rather than fabricating CVEs.
- It does not promise compliance with any specific standard (SOC2, PCI, etc.).
  Compliance work is out of scope; cite findings and let the team map them.
- It does not consult external models. If you want a second opinion, run the
  consultation manually and add the findings as quoted advisory context.
