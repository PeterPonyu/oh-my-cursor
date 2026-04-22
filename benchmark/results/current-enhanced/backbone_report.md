# Cursor Backbone Benchmark (backbone)

Root: `/home/zeyufu/Desktop/oh-my-cursor`

Invocation root: `/home/zeyufu/Desktop/oh-my-cursor`

Variant: `enhanced`

| Check | Result | Duration (s) | Markers |
| --- | --- | ---: | --- |
| `default_auth` | PASS | 2.23 | `CURSOR_AUTH_OK`, `CURSOR_MODEL_AUTO_OK` |
| `surface_visibility` | PASS | 0.17 | `REFINEMENT_MAP_OK`, `PLUGIN_BOUNDARY_OK`, `DISCOVERABILITY_OK` |
| `state_contract` | PASS | 0.02 | — |
| `backbone_verify` | PASS | 0.04 | — |
| `smoke_cursor` | PASS | 26.49 | `CURSOR_AGENT_OK`, `CURSOR_TASK_SCENARIO_OK`, `CURSOR_TASK_PLAN_OK` |

## Evaluation contract

- Contract score: **170/170**
- Contract threshold: **170/170**
- Benchmark gate: **PASS**
- Baseline floor reference: **130**
- Actual delta vs baseline floor: **40**
- Enhanced-only uplift budget: **40**
- Improvement summary: Enhanced evidence improved by 40 over the baseline floor; benchmark-backed uplift observed.
- Investigation required: **no**
- This report is environment-gated runtime proof layered on top of the always-required static validators.
- Cross-host comparability class: **reporting-comparable**, not architectural parity with `oh-my-copilot`.

| Dimension | Required | Passed | Weight | Description |
| --- | --- | --- | ---: | --- |
| `default_auth` | yes | PASS | 20 | default Cursor auth is available |
| `CURSOR_MODEL_AUTO_OK` | yes | PASS | 15 | cursor-agent exposes the auto model |
| `surface_visibility` | yes | PASS | 20 | visible repo-native surfaces match the intended backbone |
| `REFINEMENT_MAP_OK` | yes | PASS | 10 | README exposes the refinement-priority map |
| `PLUGIN_BOUNDARY_OK` | yes | PASS | 10 | README exposes the plugin-boundary review |
| `DISCOVERABILITY_OK` | yes | PASS | 10 | README Start here path exposes the key proof docs together |
| `state_contract` | yes | PASS | 20 | repo/user state contract stays bounded and explicit |
| `backbone_verify` | yes | PASS | 25 | backbone verification passes |
| `CURSOR_AGENT_OK` | yes | PASS | 20 | model-backed cursor smoke returns CURSOR_AGENT_OK |
| `CURSOR_TASK_SCENARIO_OK` | yes | PASS | 10 | agent can answer a constrained practical repo-task question |
| `CURSOR_TASK_PLAN_OK` | yes | PASS | 10 | agent can choose the right validator and ownership class for a packaging claim |
