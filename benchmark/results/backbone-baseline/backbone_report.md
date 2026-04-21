# Cursor Backbone Benchmark (backbone)

Root: `/home/zeyufu/Desktop/oh-my-cursor`

Variant: `baseline`

| Check | Result | Duration (s) | Markers |
| --- | --- | ---: | --- |
| `default_auth` | PASS | 2.49 | `CURSOR_AUTH_OK`, `CURSOR_MODEL_AUTO_OK` |
| `surface_visibility` | PASS | 0.01 | — |
| `state_contract` | PASS | 0.02 | — |
| `backbone_verify` | PASS | 0.0 | — |
| `smoke_cursor` | PASS | 2.3 | — |

## Evaluation contract

- Score: **100/120**
- Threshold: **100/120**
- Release gate: **PASS**
- Baseline floor: **100/120**
- Actual delta vs baseline floor: **0**
- Required delta vs baseline floor: **20**

| Dimension | Required | Passed | Weight | Description |
| --- | --- | --- | ---: | --- |
| `default_auth` | yes | PASS | 20 | default Cursor auth is available |
| `CURSOR_MODEL_AUTO_OK` | yes | PASS | 15 | cursor-agent exposes the auto model |
| `surface_visibility` | yes | PASS | 20 | visible repo-native surfaces match the intended backbone |
| `state_contract` | yes | PASS | 20 | repo/user state contract stays bounded and explicit |
| `backbone_verify` | yes | PASS | 25 | backbone verification passes |
| `CURSOR_AGENT_OK` | no | FAIL | 20 | model-backed cursor smoke returns CURSOR_AGENT_OK |
