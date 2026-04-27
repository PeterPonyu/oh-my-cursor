---
name: debug
description: Root-cause analysis with explicit hypotheses, evidence, and the smallest next probe.
---

# Debug

> **Cursor host note.** This skill is a thinking discipline, not an
> orchestration runtime. The Cursor agent uses normal workspace tools (file
> reads, command execution, `@`-references, terminal output) to gather
> evidence. There is no hidden state machine; the entire workflow is
> reproducible from the chat.

## Use when

- Something is broken, slow, or behaving unexpectedly.
- You have an error, a failing test, or an unexplained log line.
- You are about to "just try things" - stop, and run this skill instead.

## Skip when

- The fix is obvious and the user just wants it applied.
- The problem is a clear feature request, not a defect.

## Goal

Find the real failure signal quickly and recommend the smallest next fix or
verification step. Distinguish symptoms from root cause; never claim a fix
without evidence.

## Workflow

1. **Restate the failure.** One sentence: what was expected, what happened,
   how it was observed. If any part is fuzzy, ask the user before guessing.
2. **Reproduce narrowly.** Find or build the smallest command, test, or input
   that triggers the failure. Note the exact command and output.
3. **Form 2-3 competing hypotheses.** Write them out. Resist locking in the
   first guess.
4. **Gather evidence per hypothesis.** Read code, logs, configs, recent diffs
   (`git log --oneline -20`, `git diff HEAD~1`), and runtime output.
5. **Rank hypotheses by evidence strength** (see hierarchy below).
6. **Falsify your favorite.** State what observation would kill the leading
   hypothesis. Look for that observation.
7. **Name the critical unknown** - the single missing fact that keeps the top
   two hypotheses apart.
8. **Recommend the smallest next probe** - the cheapest action that would
   discriminate between the top hypotheses.
9. **Stop here.** This skill diagnoses; it does not auto-fix. Hand the report
   to the user (or to the `iterate-loop` skill) for the actual fix.

## Evidence strength (strong to weak)

1. Controlled reproduction with a single variable changed.
2. Primary artifacts with tight provenance (logs, traces, git history).
3. Multiple independent sources converging.
4. Single-source code-path inference.
5. Circumstantial clues (timing, naming, resemblance).
6. Intuition or analogy.

Down-rank any hypothesis whose support is mostly tier 5-6 when a rival has
tier 1-3 evidence.

## Output format

```
DEBUG REPORT
============

Observed failure
----------------
<one-line statement, with reproduction command>

Reproduction
------------
$ <command>
<relevant output>

Hypotheses
----------
1. <hypothesis> - confidence: <high|med|low>
   For: <evidence>
   Against: <evidence or gap>
2. <hypothesis> - confidence: <...>
   For: ...
   Against: ...

Current best explanation
------------------------
<which hypothesis leads, and why>

Critical unknown
----------------
<the one missing fact>

Smallest next action
--------------------
<exact command, edit, or check the user should run>
```

## Boundaries

- Diagnosis only; no auto-fix. Pair with `iterate-loop` if you want a fix
  attempt followed by re-verification.
- No fabricated certainty. If evidence is weak, say so and recommend the
  probe that would strengthen it.
- No broad rewrites before the failure is isolated. "Refactor the module"
  is never a debug recommendation.
- This skill does not assume any Cursor product capability beyond reading
  files and running shell commands inside the workspace.
