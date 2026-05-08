# Cursor A1-full cross-arm completeness — 2026-05-08

Resolves the "full cross-arm benchmark completion remains environment/time
gated" note from `benchmark/runs/auto-mode-report-20260428.md`. Both arms
(`vanilla`, `with-omc`) of the A1-full 60-task fixture were executed
end-to-end against the authenticated local `cursor-agent --model auto` path
on `oh-my-cursor` PR #9 (`codex/cursor-auto-oauth-report`, post-merge with
`origin/main`). Recorded evidence is under `benchmark/runs/data/` (gitignored)
and audited via the read-only `audit_runs.py` markdown summary committed at
`benchmark/runs/cross-arm-audit-20260508.md`.

## Boundary checks

- Cursor proof remains on the authenticated `cursor-agent --model auto` path
  (cursor-agent v2026.05.07-42ddaca). `cursor-agent --list-models` reports
  `auto - Auto (current)` in this local authenticated account.
- Both arms used the same A1-full 60-task fixture
  (`benchmark/runs/pilot/a1_full_tasks.json`).
- `vanilla` arm: cwd is a fresh tempdir; no Cursor skills auto-load.
- `with-omc` arm: cwd is the repo root (`/home/zeyufu/Desktop/oh-my-cursor`);
  the ported skills auto-load from `<repo>/skills/`.
- Per-arm budget cap raised from $5.00 to $10.00 in `run_a1_full.py` to fit
  the observed ~$0.06–$0.09 average per-task cost over 60 tasks; both arms
  finished well under the new cap.

## Verification commands and results

- `cursor-agent --list-models | grep -E '^auto - Auto'` → PASS:
  `auto - Auto (current)`.
- `python3 -m unittest discover benchmark/runs -p 'test_*.py'` → PASS, 7 tests.
- `python3 benchmark/runs/run_a1_full.py --model auto --arm vanilla` → PASS,
  60/60 tasks, 0 errors, spent $3.85, wallclock 2272 s.
- `python3 benchmark/runs/run_a1_full.py --model auto --arm with-omc` → PASS,
  60/60 tasks, 0 errors, spent $5.13, wallclock 2636 s.
- `python3 benchmark/runs/audit_runs.py --markdown <2 new run dirs>` → PASS,
  both runs `complete`, no missing artifacts.
- `./scripts/verify-backbone.sh` → PASS (validators continue green
  post-completion).
- `./scripts/validate-benchmark-evidence.sh` → PASS.

## Full cross-arm completeness

|repo|run dir|status|model|n_tasks|task_end|run_end|missing|errors|cost_usd|wall_s|
|---|---|---|---|---:|---:|---:|---|---:|---:|---:|
|oh-my-cursor|20260508T091711Z__A1-full__vanilla__cursor-auto__cbb70be62174|ok|cursor/auto|60|60|1|none|0|3.8502|2272|
|oh-my-cursor|20260508T093809Z__A1-full__with-omc__cursor-auto__e28d37b1fc31|ok|cursor/auto|60|60|1|none|0|5.1280|2636|

## Token totals

|arm|tokens_in|tokens_out|cache_read|cache_write|
|---|---:|---:|---:|---:|
|vanilla|322,002|78,278|5,110,348|47,167|
|with-omc|533,251|92,932|5,283,003|—|

## Resolved gates

- **Resolved**: "Full cross-arm benchmark completion is environment/time
  gated" (from `auto-mode-report-20260428.md` "Remaining risks"). Both arms
  now complete on the authenticated local `cursor-agent` with full 60-task
  coverage; recorded evidence under `benchmark/runs/data/` and audited via
  `cross-arm-audit-20260508.md`.

## Remaining caveats

- Cross-host comparison (Cursor vs Copilot) and quality-delta scoring
  (vanilla vs with-omc win-rate) remain out of scope. This report records
  routing + completeness only — not a comparative quality claim.
- Cursor runtime proof depends on the authenticated local `cursor-agent`
  installation available during this run (account- and machine-bound).
- The `with-omc` arm's behavior depends on which OMC skills auto-load from
  `<repo>/skills/` at the time of run; this is implicit in the runner.
- **Naming follow-up**: the arm name `with-omc` reuses the "OMC"
  abbreviation that elsewhere refers to ohmyclaudecode. A follow-up will
  rename `with-omc` → `with-omcs` (ohmycursor-skills) across runner, README,
  recorder schema, and historical evidence pointers. Out of scope for this
  PR.
