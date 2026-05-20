# Agent model policy

This repo keeps checked-in agent frontmatter model-neutral by default. The goal
is not to avoid model choice; it is to keep model choice in the layer where it
can be tested against the user's current Cursor account, plan, and runtime.

## Baseline Rule

All checked-in role agents under `agents/` use:

```yaml
model: auto
```

This is the OMCS baseline policy. It means the repository does not pin a role to
a model ID that may be unavailable, renamed, blocked by team policy, or
suboptimal for a future Cursor release. Cursor's official subagent docs describe
host-managed model selection and fallback behavior for subagents; this repo
treats that as **host-product-only** unless a local benchmark proves a stronger
claim.

## Why Not Pin Composer Everywhere?

Composer 2.5 can be a strong parent CLI model for long, tool-heavy tasks, but
pinning every checked-in subagent to a Composer model would be an overclaim
without role-specific evidence:

- `explore` and `researcher` benefit from fast, cheap codebase search.
- `planner`, `architect`, `critic`, and `security-reviewer` benefit from stronger reasoning.
- `implementer`, `debugger`, and `test-engineer` need reliable tool use and
  failure recovery.
- `qa-tester`, `verifier`, and `code-reviewer` need skeptical evidence checking more than
  broad generation.

Those are suitability hypotheses. They become policy only after a reproducible
benchmark shows a fixed model is required for a role.

## Role Suitability Matrix

| Role | Baseline frontmatter | Suitability hypothesis | Promotion evidence required |
| --- | --- | --- | --- |
| `orchestrator` | `model: auto` | Strong parent model; broad context and routing judgment | Multi-phase workflow smoke beats baseline on completion and no-overclaim checks. |
| `researcher` | `model: auto` | Fast model acceptable when retrieval is dominant | Search/map benchmark shows equal evidence quality at lower latency or cost. |
| `explore` | `model: auto` | Fast model often suitable for read-only mapping | File-discovery benchmark returns correct paths with lower latency. |
| `planner` | `model: auto` | Strong reasoning model may improve acceptance criteria | Planning benchmark produces fewer vague criteria and fewer replan loops. |
| `architect` | `model: auto` | Strong reasoning model may improve invariant and boundary review | Architecture benchmark catches seeded state/ownership regressions before implementation. |
| `implementer` | `model: auto` | Agentic model may improve tool use on edits | Patch benchmark passes tests with fewer retries and no scope expansion. |
| `debugger` | `model: auto` | Strong reasoning model may improve root-cause diagnosis | Failure-reproduction benchmark identifies root cause and minimal fix more often. |
| `test-engineer` | `model: auto` | Tool-capable model may improve test selection | Test-strategy benchmark catches known regression without deleting or weakening tests. |
| `qa-tester` | `model: auto` | Tool-capable model may improve bounded runtime QA evidence | Runtime-smoke benchmark runs correct validators and records evidence without editing files. |
| `verifier` | `model: auto` | Skeptical reasoning matters more than generation | Verification benchmark rejects incomplete work and cites evidence. |
| `critic` | `model: auto` | Strong reasoning model may improve assumption checks | Review benchmark finds seeded architectural risks without false blocking. |
| `code-reviewer` | `model: auto` | Strong reasoning model may improve bug finding | Code-review benchmark finds seeded correctness bugs with bounded false positives. |
| `security-reviewer` | `model: auto` | Strong reasoning/security model may improve risk discovery | Security benchmark finds seeded injection/secret/supply-chain risks. |
| `tracer` | `model: auto` | Strong reasoning model may improve causal ranking | Trace benchmark ranks seeded causal hypotheses correctly. |

## Promotion Path

A fixed model may be added to one role only when all of these are true:

1. `scripts/smoke-agent-model-suitability.sh --all-roles` or a role-specific
   benchmark records the candidate model, baseline model, prompt, command, and
   output. The default smoke intentionally checks only a representative sample
   so normal validation does not spend minutes on every role.
2. The candidate improves a role-specific metric, not just subjective wording.
3. The benchmark records the Cursor account model list or explicit bounded
   reason why the model list is unavailable.
4. `docs/references.md`, this file, and
   `scripts/validate-cursor-workflow-artifacts.py` are updated in the same
   change.
5. The change remains compatible with Cursor's documented fallback behavior when
   a model is unavailable to the user.

Until then, use `scripts/resolve-cursor-model.py` for parent CLI process model
selection and keep role frontmatter at `model: auto`.
