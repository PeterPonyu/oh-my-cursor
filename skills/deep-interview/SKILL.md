---
name: deep-interview
description: Socratic ambiguity gating - ask one targeted question at a time until the request is clear enough to act on.
---

# Deep Interview

> **Cursor host note.** This is a conversation pattern, not a stateful loop.
> Cursor does not (in current verified docs) expose a runtime "interview state"
> primitive that this repo can own. The skill therefore tracks ambiguity in
> plain text inside the chat, and writes the final crystallized spec to
> `docs/specs/<slug>.md` so it survives the session.

## Use when

- The user has a vague idea ("build me something that does X-ish").
- You want to avoid a "that is not what I meant" outcome from autonomous work.
- The user says "interview me", "ask me everything", "I am not sure exactly".

## Skip when

- The request is already specific (file paths, function names, acceptance
  criteria).
- The user said "just do it" or "skip the questions" - respect that.
- A spec or plan already exists; use it directly.

## Ambiguity dimensions

Track four dimensions on a 0.0-1.0 clarity scale. The product
(`weighted_clarity`) gives an ambiguity score = `1 - weighted_clarity`.

| Dimension | Greenfield weight | Brownfield weight |
|-----------|-------------------|-------------------|
| Goal | 0.40 | 0.35 |
| Constraints | 0.30 | 0.25 |
| Success criteria | 0.30 | 0.25 |
| Existing-code context | n/a | 0.15 |

The default proceed-threshold is `ambiguity <= 0.20`. The user can override
("0.1 or stop", "good enough at 0.3").

## Workflow

1. **Restate the idea** in one sentence and confirm it back to the user.
2. **Brownfield check.** If there is existing code, read the relevant files
   first via Cursor's `@`-references. Cite what you found before asking the
   user about it.
3. **Score the four dimensions** mentally. Pick the lowest one as the next
   target.
4. **Ask exactly one question** that improves the weakest dimension. Name the
   dimension and why it is the bottleneck in one short sentence.
5. **Re-score** after the answer. Show the user the updated scores in a small
   table so they can see progress.
6. **Loop** until `ambiguity <= threshold`, or the user calls "enough", or 20
   rounds is reached (hard cap).
7. **Crystallize** the spec to `docs/specs/<slug>.md` using the template below.
8. **Hand off.** Suggest the next skill (`plan`, `iterate-loop`,
   `auto-execute`) but do not invoke it; the user picks.

## Question targeting

| Weakest dim | Question style |
|-------------|----------------|
| Goal | "When you say X, what specifically happens first?" |
| Constraints | "Should this work offline? Which platforms?" |
| Success | "How would I know it works without asking you?" |
| Context | "I see `src/auth/` uses JWT. Extend or diverge?" |

## Spec template

```markdown
# Spec: <title>

- Final ambiguity: <score>
- Rounds: <n>
- Type: greenfield | brownfield

## Goal
<single, unambiguous sentence>

## Constraints
- <constraint>

## Non-goals
- <explicit exclusion>

## Acceptance criteria
- [ ] <testable>

## Notes from interview
- <any decisions worth remembering>
```

## Boundaries

- This skill does not implement a "challenge agent" runtime, ontology graph
  database, or persisted state across sessions. Those features in OMC's
  `deep-interview` rely on hooks Cursor does not document; this adaptation is a
  paper version of the same idea that is fully reproducible by the model
  itself in chat.
- Mathematical scoring here is an honest estimate from the model. It is not
  an audited metric. Treat it as a forcing function, not a proof.
- Specs are advisory; they do not gate execution unless a downstream skill
  (e.g. `plan`, `auto-execute`) chooses to read them.

## Stop conditions

- `ambiguity <= threshold`.
- User says "stop", "cancel", "enough", "just go".
- Hard cap at 20 rounds (proceed with whatever clarity exists; warn the user).
- The same score (+/- 0.05) for three rounds - reframe with a "what IS this,
  really?" question instead of asking another detail question.
