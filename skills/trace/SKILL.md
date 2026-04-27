---
name: trace
description: Evidence-driven causal tracing - explain why an observed result happened by ranking competing hypotheses.
---

# Trace

> **Cursor host note.** Trace is a single-agent thinking pattern in this
> repo. OMC's original `trace` skill spawns parallel "tracer lanes" via a
> built-in team primitive; Cursor does not document an equivalent
> repo-checked-in primitive, so this adaptation runs the lanes sequentially
> in one chat with explicit lane labels. If you have access to multiple
> `cursor-agent` invocations, you can simulate parallel lanes by running this
> skill in separate terminals and merging the outputs by hand.

## Use when

- The question is "why did this happen?", not "make it stop".
- The problem is ambiguous, causal, or evidence-heavy.
- The right next step is to explore competing explanations, not to patch.

Examples: regressions, latency spikes, weird routing behavior, unexpected
benchmark numbers, post-mortems, "given this output, what likely caused it".

## Skip when

- The fix is obvious; just apply it.
- The user wants you to do something, not to explain something.
- A single, strong piece of evidence already pins the cause.

## Tracing contract (preserve these distinctions)

1. **Observation** - exactly what was seen.
2. **Hypotheses** - competing explanations, deliberately different.
3. **Evidence for** each hypothesis.
4. **Evidence against / gaps** for each hypothesis.
5. **Current best explanation**.
6. **Critical unknown** - the missing fact keeping the top two apart.
7. **Discriminating probe** - the cheapest next step that would collapse
   uncertainty.

Do not collapse this into a generic debug summary or a fix-it loop.

## Default lanes (use unless the prompt suggests a better partition)

1. **Code-path / implementation cause** - the bug is in our code.
2. **Config / environment / orchestration cause** - the bug is in how the
   system is wired up, deployed, or configured.
3. **Measurement / artifact / assumption mismatch** - the "bug" is in how we
   are observing or interpreting the result.

## Workflow

1. **Restate the observation** precisely in one sentence.
2. **Generate 3 hypotheses**, one per default lane, deliberately different.
3. **For each lane, gather evidence** for and against. Cite file paths, log
   lines, commit hashes, or command output - not memory.
4. **Rank evidence strength** per the hierarchy below.
5. **Apply at least one cross-check lens**:
   - **Systems**: queues, retries, backpressure, upstream/downstream.
   - **Premortem**: "if my leading explanation is wrong, what would expose
     it?"
   - **Science**: controls, confounders, alternative variables.
6. **Run a rebuttal round.** Let the strongest non-leader argue back at the
   leader. Re-rank if it lands.
7. **Synthesize** using the output template below.

## Evidence strength (strong to weak)

1. Controlled reproduction with one changed variable.
2. Primary artifacts with provenance (traces, logs, metrics, configs).
3. Multiple independent sources converging.
4. Single-source code-path inference.
5. Circumstantial clues (timing, naming, resemblance).
6. Intuition or analogy.

## Output format

```
TRACE SYNTHESIS
===============

Observed result
---------------
<one-line statement>

Ranked hypotheses
-----------------
| Rank | Hypothesis | Confidence | Evidence strength |
|------|-----------|------------|-------------------|
| 1 | ... | high/med/low | strong/moderate/weak |
| 2 | ... | ... | ... |
| 3 | ... | ... | ... |

Evidence summary
----------------
- H1: <for> | <against>
- H2: ...
- H3: ...

Rebuttal round
--------------
- Strongest rebuttal to leader: <argument>
- Why leader still holds (or now does not): <answer>

Most likely explanation
-----------------------
<the leading hypothesis, in plain English>

Critical unknown
----------------
<the single missing fact>

Discriminating probe
--------------------
<the cheapest next step that would settle it>
```

## Down-ranking rules (be explicit)

A hypothesis moves down when it:
- is contradicted by stronger evidence,
- predicted an observation that did not occur,
- requires extra ad-hoc assumptions,
- explains fewer facts than the leader,
- lost the rebuttal round, or
- collapsed into a stronger parent explanation (merge it; say so).

## Boundaries

- Trace produces an explanation, not a fix. Pair with `debug` or
  `iterate-loop` when you are ready to act on the findings.
- It does not invent evidence. If a probe is needed, it names the probe
  rather than guessing the result.
- It does not assume Cursor offers a multi-lane runtime; lanes are an
  organizational discipline inside one chat.
