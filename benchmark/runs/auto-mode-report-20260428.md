# Cursor auto and Copilot OAuth evidence report — 2026-04-28

Updated after the Ollama sidecar was rejected for this task. Cursor proof stays
on the authenticated `cursor-agent --model auto` path, and Copilot proof now
uses the authenticated `copilot --model gpt-4.1` path instead of local Ollama.

## Boundary checks

- Cursor auto evidence is labeled `cursor/auto`, and each recorded command
  forwards `--model auto` to the real `cursor-agent` binary.
- `cursor-agent --list-models` reports `auto - Auto (current)` in this local
  authenticated account.
- Copilot evidence is no longer local/free Ollama evidence; it is the real
  OAuth-backed GitHub Copilot CLI with explicit `--model gpt-4.1` and
  `premiumRequests=0` in smoke runs.
- Local Ollama artifacts from earlier experiments are superseded and should not
  be cited as quality evidence for either host product.
- Stale 2026-04-27 run dirs were inspected and preserved; no stale historical
  event files were rewritten.

## Verification commands and results

- `python3 -m py_compile benchmark/runs/host_client.py benchmark/runs/pilot/run_a1_pilot.py benchmark/runs/run_a1_full.py` in `oh-my-cursor` → PASS.
- `python3 -m unittest discover benchmark/runs -p 'test_*.py'` in `oh-my-cursor` → PASS, 7 tests.
- `cursor-agent --list-models | grep -E '^auto - Auto'` in `oh-my-cursor` → PASS: `auto - Auto (current)`.
- `python3 benchmark/runs/pilot/run_a1_pilot.py --model auto --limit 1 --arm both --timeout 180` in `oh-my-cursor` → PASS.
- `python3 benchmark/runs/run_a1_full.py --model auto --limit 1 --arm vanilla --timeout 180` in `oh-my-cursor` → PASS.
- `python3 benchmark/runs/pilot/run_a1_pilot.py --model gpt-4.1 --limit 1 --arm both --timeout 180` in `oh-my-copilot` → PASS with `premiumRequests=0`.
- `python3 benchmark/runs/run_a1_full.py --model gpt-4.1 --limit 1 --arm vanilla --timeout 180` in `oh-my-copilot` → PASS with `premiumRequests=0`.

## New run completeness

|repo|run dir|status|model|n_tasks|task_end|run_end|missing|premium|errors|
|---|---|---|---|---:|---:|---:|---|---:|---:|
|oh-my-cursor|20260428T074445Z__a1-pilot__vanilla__cursor-auto__6f6c7b475205|ok|cursor/auto|1|1|1|none||0|
|oh-my-cursor|20260428T074510Z__a1-pilot__with-omc__cursor-auto__bd0a8deb43c2|ok|cursor/auto|1|1|1|none||0|
|oh-my-cursor|20260428T074536Z__A1-full__vanilla__cursor-auto__de0d58762c7b|ok|cursor/auto|1|1|1|none||0|
|oh-my-copilot|20260428T075845Z__A1__vanilla__github_copilot-cli_gpt-4.1__7e4e1ef2a54d|ok|github/copilot-cli/gpt-4.1|1|1|1|none|0|0|
|oh-my-copilot|20260428T075915Z__A1__with-omc__github_copilot-cli_gpt-4.1__c1dce149ec8a|ok|github/copilot-cli/gpt-4.1|1|1|1|none|0|0|
|oh-my-copilot|20260428T080013Z__A1-full__vanilla__github_copilot-cli_gpt-4.1__acf5e6e96883|ok|github/copilot-cli/gpt-4.1|1|1|1|none|0|0|

## Preserved stale-run audit

|repo|run dir|status|model|task_end|run_end|missing|disposition|
|---|---|---|---|---:|---:|---|---|
|oh-my-copilot|20260427T083059Z__A1-full__vanilla__github_copilot-cli__285e509a3894|running|github/copilot-cli|10|0|run_end, summary.csv, replay.txt|stale/superseded; preserve without rewriting|
|oh-my-cursor|20260427T080549Z__a1-pilot__vanilla__cursor-auto__c1dfffb1c041|running|cursor/auto|1|0|run_end, summary.csv, replay.txt|stale/superseded; preserve without rewriting|

## Remaining risks

- Full cross-arm benchmark completion is environment/time gated; bounded OAuth
  and auto-mode smokes prove model routing, not a complete quality comparison.
- Copilot `--model auto` is environment-gated in this account and returned
  `402 You have no quota`; `gpt-4.1` is the confirmed zero-premium-request
  Copilot smoke model here.
- Cursor runtime proof depends on the authenticated local `cursor-agent`
  installation available during this run.
