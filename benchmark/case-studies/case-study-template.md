---
case_id: C1-XXX
task_type: <plan|review|debug|migrate|other>
skill_under_test: <skill-name>
date: YYYY-MM-DD
rater: <name or handle>
arm_a_model: <model id, e.g. anthropic/claude-sonnet-4-6>
arm_b_model: <same model id; only the skill differs>
---

# Cursor C1 case study — <short title>

> This is a qualitative case study, not a statistical claim. N=1 by design.

## Task description

Describe the task in 2-4 sentences. Include the user's actual ask, any
relevant context (codebase area, prior turns), and the success criteria a
human reviewer would apply. Link to the recorded JSONL transcripts for
both arms.

- Arm A (without-skill) transcript: `path/to/...jsonl`
- Arm B (with-skill) transcript:    `path/to/...jsonl`

## Without-skill arm (baseline)

### Output (verbatim or trimmed quote)

Paste the model's actual reply. Trim only obvious filler; mark trims with `[...]`.

### Observations

- What did the model produce?
- What was missing, wrong, or excessive?
- How long did it take? How many tokens?

## With-skill arm

### Output (verbatim or trimmed quote)

Paste the model's actual reply. Trim only obvious filler; mark trims with `[...]`.

### Observations

- What did the skill add or change in the response shape?
- Did the skill cite sources, structure output, or invoke verification?
- Latency / token cost vs the baseline.

## Comparative notes

A short table or bulleted side-by-side of the two arms across the
dimensions that mattered for *this* task (e.g. correctness, completeness,
structure, calibrated uncertainty, time-to-useful-answer).

| dimension          | without skill | with skill |
| ------------------ | ------------- | ---------- |
| correctness        |               |            |
| completeness       |               |            |
| structure          |               |            |
| calibration        |               |            |
| time-to-useful     |               |            |

## Honest negatives

Cases inside this single case where the skill misfired, added noise, or
was strictly worse. If none, write "None observed in this case" and
explain what you looked for.

## Verdict (qualitative)

One paragraph. Be specific about *why* one arm was better, and what kind
of task this evidence does and does not generalize to.

---

This is a qualitative case study, NOT a statistical claim. N=1 by design.
