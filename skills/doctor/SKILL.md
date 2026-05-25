---
name: doctor
description: "[OMCS] Diagnose Cursor + oh-my-cursor installation health and report what is repo-owned, host-product-only, or missing."
---

# Doctor

> **Cursor host note.** This is a diagnostic skill, not a fixer. It checks the Cursor host configuration (CLI, rules, optional plugin slots) and the oh-my-cursor repo backbone (root files, validators, plugin manifest, the shipped skill set). It does not modify Cursor's installation, does not touch user settings, and does not assume capabilities outside the repo's confirmed-surfaces ledger.

## Governance

### Ownership Class
- **repo-owned**: YES — Checked in at `skills/doctor/SKILL.md` as a diagnostic skill for installation health.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class
- **official-doc**: NO — Cursor does not document a diagnostic primitive; this is repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/doctor/SKILL.md`, validators (`verify-backbone.sh`, `validate-surface-visibility.sh`, etc.), skill catalogue check.
- **runtime-smoke**: YES — Runs validators and checks actual filesystem state; smoke test for repo health.

### Claim Summary
This skill is a diagnostic-first tool that checks Cursor host configuration, repo backbone, validators, skill catalogue, plugin manifest, and rules sanity. It does not modify anything; it only reports. No MCP or hooks required; this is a read-only diagnostic workflow.

## MCP Integration Points

No direct MCP integration. This skill reads repo artifacts and reports; no state updates.

## Hooks Dependencies

No hooks dependencies. This skill runs entirely within the Cursor chat.

## Orchestration Role

- **Lifecycle phase(s)**: intake
- **Invoked by**: User, new contributors, before running `iterate-loop` or `auto-execute`
- **Invokes**: No other skills; runs validators and reports
- **State contract**: No workflow-state updates; reports to chat
- **Failure handling**: Reports validator failures; does not auto-fix

## Use when

- A new contributor wants to confirm their machine is set up correctly.
- After upgrading Cursor or pulling a new repo version.
- Before running `iterate-loop`, `parallel-batch`, or `auto-execute` for
  the first time.
- Something feels off and you want a clean diagnostic before touching
  anything.

## Skip when

- You are mid-iteration and just want to keep working.
- You already know what is wrong; fix it directly.

## Checks

### 1. Cursor CLI

```bash
cursor-agent --version  # verify against installed Cursor CLI
```

- OK: a version string is printed.
- WARN: command not found - parallel-batch and auto-execute will fall back
  to sequential / single-agent mode.

### 2. Repo root files (repo-owned)

```bash
ls AGENTS.md README.md
ls .cursor/rules/
ls .cursor-plugin/plugin.json
```

- OK: all three exist.
- CRITICAL if `AGENTS.md` is missing - the repo's instruction surface is
  gone.
- WARN if `.cursor-plugin/plugin.json` is missing - the plugin slot is
  unset; the repo still works as a rules+skills bundle but cannot be loaded
  as a local plugin.

### 3. Validators

```bash
./scripts/verify-backbone.sh
./scripts/validate-surface-visibility.sh
./scripts/validate-state-contract.sh
./scripts/validate-plugin-structure.sh
```

- Run each. Surface the exit code in the report.
- Do not auto-fix; just report which validators failed and the first error
  they printed.

### 4. Memory validators (when `docs/memory-layer.md` is present)

```bash
python3 scripts/validate-memory-templates.py
python3 scripts/validate-notepad-format.py docs/templates/notepad.md
python3 scripts/validate-project-memory.py docs/templates/project-memory.json
bash scripts/validate-rules-install-parity.sh
python3 -m pytest tests/memory -q
```

Report each command as OK / FAIL / SKIPPED. These are repo-owned proof for
the memory layer; they do not require the MCP bridge.

### 5. Skill catalogue

```bash
ls skills/
```

- Enumerate every directory under `skills/` from the actual filesystem;
  do not hardcode an expected count. Each skill directory must contain a
  `SKILL.md` whose frontmatter declares a `name:` matching the directory.
- WARN if any directory is missing `SKILL.md`, or if the `name:` value
  does not match its directory.

### 6. Plugin manifest

Read `.cursor-plugin/plugin.json` and confirm it parses as JSON, has a
`name` and `version`, and (if it lists skills) every listed skill has a
matching `skills/<name>/SKILL.md`.

### 7. Rules sanity

Read `.cursor/rules/*.mdc` and confirm each file:
- has a YAML frontmatter block,
- has a `description` field, and
- declares either `alwaysApply: true` or a `globs:` pattern.

### 8. Optional local install

```bash
./scripts/check-local-plugin-install.sh
```

If present, run it. This is a CI-safe bounded check; report its exit code.

## Report format

```
DOCTOR REPORT
=============

Summary: HEALTHY | ISSUES FOUND

| Check | Status | Details |
|-------|--------|---------|
| Cursor CLI | OK / WARN | version or "not installed" |
| Repo root files | OK / WARN / CRITICAL | which files exist |
| Validators | OK / FAIL | which scripts failed |
| Skill catalogue | OK / WARN | missing skill dirs |
| Plugin manifest | OK / WARN | parse + cross-check result |
| Rules sanity | OK / WARN | malformed files |
| Local install check | OK / FAIL / SKIPPED | exit code |

Issues
------
1. <issue + file:line if applicable>

Recommended next steps
----------------------
- <smallest action that addresses each issue>
```

## Boundaries

- Read-only by default. This skill does not delete files, rewrite settings,
  or "auto-fix" anything. Suggested actions are surfaced; the user runs
  them.
- It does not claim Cursor capabilities the repo cannot ship. MCP servers,
  background agents, custom modes, and hooks are out of scope; if the
  user wants to verify those, they go to Cursor's product UI.
- It does not check other repos on disk; scope is the current workspace.
- If a check requires a tool that is not installed, the result is `SKIPPED`
  with a one-line reason - never `OK` and never invented evidence.

## Stop conditions

- All checks reported.
- The user said "stop" mid-scan.
- A check itself failed in a way that prevents further checks (e.g. the
  workspace root is wrong) - report what was learned and stop.
