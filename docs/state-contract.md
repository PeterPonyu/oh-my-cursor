# Cursor State Contract

This repository keeps its state contract intentionally small, explicit, and
aligned with the claim/proof discipline.

## Ownership model

| State family | Ownership class | Current rule |
| --- | --- | --- |
| User auth and default model selection | `host-product-only` user environment | Cursor CLI auth/model state lives outside the repo. |
| Repo guidance, root rules, hooks, agents, repo-root plugin files, validators, and optional runtime smokes | `repo-owned` | This repo checks in the files that define its backbone and proof surface. |
| Default MCP config, repo memories, custom modes, background-agent files | `unsupported-or-out-of-scope` until deliberately adopted | These are not checked in by the current backbone. |

## User-level state

The authenticated Cursor CLI state belongs to the user environment, not the
repository:

- `~/.cursor/cli-config.json`
- `~/.cursor/plugins/local/` for local plugin loading during manual validation
- other Cursor caches and agent state under `~/.cursor/`

That is why this repo validates **default auth availability** rather than
pretending the repo provisions auth by itself.

## Repo-level state

The repository currently owns only these checked-in state-like surfaces:

- `AGENTS.md`
- `.cursor/rules/*.mdc`
- `.cursor-plugin/plugin.json`
- `hooks/hooks.json` and `hooks/` (`session-bootstrap.ts`, `session-summary.ts`, `prompt-router.ts`, `tool-guard.ts`, `state-watcher.ts`, `failure-router.ts`, `subagent-bootstrap.ts`, `subagent-summary.ts`, `shell-guard.ts`, `shell-debrief.ts`, `read-advisor.ts`, `claim-guard.ts`, `compact-reminder.ts`, `stop-gate.ts`)
- `agents/` (`orchestrator`, `architect`, `researcher`, `planner`,
  `implementer`, `qa-tester`, `verifier`, `critic`, `code-reviewer`,
  `debugger`, `tracer`, `security-reviewer`, `explore`, `test-engineer`)
- `.cursor/state/` workflow-state contract (`workflow-state.schema.json`,
  `workflow-state.example.json`, compatibility shims, `README.md`) and the
  packaged implementation at `src/oh_my_cursor/workflow_state/`
- the shipped plugin rule/skill payload that accompanies the manifest, including
  `skills/phase-controller/SKILL.md`
- bounded documentation, including `docs/orchestration.md`
- local validators and optional runtime-smoke scripts (including
  `scripts/validate-workflow-state.ts`)
- `apps/cursor-backbone-site/` and `.github/workflows/deploy-pages.yml` only
  when they are actually checked in and locally validated

Those are the only surfaces this repo should describe as `repo-owned`
state/proof artifacts today.

If the Pages app/workflow is absent, it remains a planned or missing checked-in
artifact rather than a current state guarantee.

## Local scratch-state policy

Treat local orchestration scratch directories as workspace-private unless a
specific artifact is intentionally documented, reviewed, and checked in. Durable
planning or context notes may be tracked when they are part of a reviewed
workflow, while session churn remains ignored by default.

`.omcs/` is the oh-my-cursor scratch directory and is gitignored. The MCP
bridge at `mcp/cursor-state-bridge/` writes its structured trace lane to
`.omcs/cursor-state-bridge/trace.jsonl` once the trace implementation lands
in Phase 6 (a path explicitly chosen to avoid colliding with the existing
hook trace at `.omcs/hook-trace.log`). `.omcs/cursor-state-bridge/` is a
permitted runtime write target for the bridge — workspace-private,
gitignored, and **not** a checked-in `repo-owned` surface in its own right.

## History retention

`history[]` grows by one entry per state mutation. To prevent unbounded
file growth on long-lived tasks, every write path applies a FIFO
eviction cap (default **1000**) immediately before the atomic
tmp+rename. The cap is configurable per call via `history_cap` (library
API and bridge tool params) or `--history-cap N` on the CLI shim, and
`history_cap=0` opts out of compaction. Eviction preserves timestamp
monotonicity by retaining the trailing window of the array. Local
verification: `node --experimental-strip-types scripts/validate-workflow-state.ts
--check-history-cap 1000 <path>` enforces the cap and re-checks the
monotonic invariant.

## Workflow-state contract

The `.cursor/state/workflow-state.schema.json` schema defines the shape of an
opt-in, file-backed workflow-state document used by the `phase-controller`
skill and the `stop-gate.ts` hook. Documents that follow the schema are the
only state object hooks may **read**; nothing in this repo writes that state
automatically. The validator at `scripts/validate-workflow-state.ts` keeps the
contract honest. See [`docs/orchestration.md`](./orchestration.md) for the full
lifecycle map.

## Host-product-only state

Some Cursor capabilities depend on product-managed state that this repo does not
own, including:

- authenticated CLI account state;
- default model selection;
- runtime session history and caches; and
- any product-managed configuration behind modes or background-agent behavior.

These may be real Cursor capabilities, but they are not repo-owned guarantees.

## Explicit non-state surfaces

Until they are directly proven, chosen, and intentionally adopted, this repo
does **not** check in:

- `.cursor/mcp.json`
- `.cursor/memories/`
- custom mode packaging
- background-agent provisioning
- unchecked workflow surfaces beyond the hooks and agents shipped here

## Why this matters

The safest Cursor-native backbone is one that separates:

1. **user auth + model availability**
2. **repo guidance, root rules, repo-root plugin files, and checked-in proof artifacts**
3. **future optional integrations**

That prevents hidden product-state assumptions from turning into fake
repository guarantees.

The same rule applies to any future landing site: a repo-owned Pages surface is
real only when the checked-in app, workflow, and exported-output validation all
exist together.

## Local validation

Run:

```bash
node --experimental-strip-types scripts/install-local-plugin.ts
./scripts/check-local-plugin-install.sh
./scripts/check-default-auth.sh
./scripts/validate-state-contract.sh
```

The validation script keeps this state contract bounded to checked-in proof.
<!-- end state contract -->
