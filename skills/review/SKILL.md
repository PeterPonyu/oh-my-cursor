---
name: review
description: Severity-rated code review covering quality, security, performance, and architectural risk.
---

# Review

> **Cursor host note.** This is a checklist + report skill that the Cursor
> agent runs against a diff in the current workspace. It does not spawn
> sub-agents (Cursor's checked-in skill model does not document a sub-agent
> primitive this repo can own). If you want a second opinion, run the
> `review` skill once, then run `security-review` separately, then synthesize.

## Use when

- A pull request or feature branch is ready for review.
- You finished a non-trivial change and want a quality pass before commit.
- Someone asked for a code review on specific files.

## Skip when

- The change is a typo, formatting, or a one-line obvious fix.
- Tests are still failing (fix tests first, then review).
- The user wants only a security pass; use `security-review` directly.

## Workflow

1. **Identify scope.** Run `git diff` (or `git diff <base>...HEAD`) to list
   changed files. Confirm scope with the user if it is unclear.
2. **Read every changed file.** Do not review from the diff alone; load the
   surrounding code so context is honest.
3. **Walk the four lenses** below in order, recording findings as you go.
4. **Assign severity** to every finding (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
5. **Write the report** in the format below.
6. **Final verdict** uses the deterministic gating rules.

## Review lenses

### 1. Security
- Hardcoded secrets, API keys, tokens, connection strings.
- Injection risks (SQL, NoSQL, command, prompt).
- XSS, CSRF, SSRF, path traversal, broken access control.
- Cryptography (weak hashing, broken algorithms, predictable randomness).

### 2. Code quality
- Function size (> 50 lines is a smell, not a rule).
- Cyclomatic complexity, deep nesting (> 4 levels).
- Duplicated logic that should share a helper.
- Naming that lies about behavior.
- Commented-out code, leftover `TODO`, `console.log`, `debugger`.

### 3. Performance
- N+1 query patterns.
- O(n^2) loops where O(n) is reachable.
- Unnecessary re-renders or recomputes in UI code.
- Sync I/O on hot paths.

### 4. Architectural risk (devil's advocate lane)
- New coupling between modules that should stay independent.
- Hidden boundary breakage (a public type changed without notice).
- Missing tests for the riskiest path.
- Tradeoffs the author may not have noticed.

## Severity rubric

| Severity | Meaning |
|----------|---------|
| CRITICAL | Security vulnerability or data loss; must fix before merge. |
| HIGH | Bug or major code smell; should fix before merge. |
| MEDIUM | Real issue, fix when possible. |
| LOW | Style or suggestion; consider fixing. |

## Architectural status

| Status | Meaning |
|--------|---------|
| CLEAR | No unresolved design blocker. |
| WATCH | Non-blocking concern that must appear in the report. |
| BLOCK | Unresolved design concern; not merge-ready. |

## Final verdict (deterministic)

- If architectural status is `BLOCK` -> `REQUEST CHANGES`.
- Else if any `CRITICAL` or `HIGH` is unresolved -> `REQUEST CHANGES`.
- Else if architectural status is `WATCH` or only `MEDIUM`/`LOW` remain ->
  `COMMENT`.
- Else -> `APPROVE`.

## Report format

```
REVIEW REPORT
=============

Files reviewed: <n>
Issues: CRITICAL=<a>, HIGH=<b>, MEDIUM=<c>, LOW=<d>
Architectural status: CLEAR | WATCH | BLOCK

CRITICAL
--------
- <path>:<line> - <issue>
  Risk: <why it matters>
  Fix: <concrete change>

HIGH / MEDIUM / LOW
-------------------
(same format)

ARCHITECTURE WATCHLIST
----------------------
- <path>:<line> - <concern>
  Status: WATCH | BLOCK
  Recommendation: <what to do>

VERDICT: APPROVE | COMMENT | REQUEST CHANGES
```

## Boundaries

- Read-only by default. This skill does not edit code; pair it with
  `iterate-loop` or a manual fix pass.
- It does not call external models (no Codex, no Gemini cross-check). If you
  want a second model's opinion, run that consultation manually and add its
  findings to the report.
- It does not run `npm audit` or any package-vulnerability scanner; that
  belongs in `security-review`.
