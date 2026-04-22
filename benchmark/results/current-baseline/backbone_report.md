# Cursor Backbone Benchmark (backbone)

Root: `/home/zeyufu/Desktop/oh-my-cursor`

Invocation root: `/home/zeyufu/Desktop/oh-my-cursor`

Variant: `baseline`

| Check | Result | Duration (s) | Markers |
| --- | --- | ---: | --- |
| `default_auth` | PASS | 2.22 | `CURSOR_AUTH_OK`, `CURSOR_MODEL_AUTO_OK` |
| `surface_visibility` | PASS | 0.15 | `REFINEMENT_MAP_OK`, `PLUGIN_BOUNDARY_OK` |
| `state_contract` | PASS | 0.02 | — |
| `backbone_verify` | PASS | 0.04 | — |
| `smoke_cursor` | PASS | 0.0 | — |

## Evaluation contract

- Score: **120/140**
- Threshold: **120/140**
- Benchmark gate: **PASS**
- Baseline floor: **120/140**
- Actual delta vs baseline floor: **0**
- Required delta vs baseline floor: **20**
- Improvement summary: Baseline reference run establishes the comparison floor; use an enhanced run to measure Cursor smoke uplift.
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
| `state_contract` | yes | PASS | 20 | repo/user state contract stays bounded and explicit |
| `backbone_verify` | yes | PASS | 25 | backbone verification passes |
| `CURSOR_AGENT_OK` | no | FAIL | 20 | model-backed cursor smoke returns CURSOR_AGENT_OK |
