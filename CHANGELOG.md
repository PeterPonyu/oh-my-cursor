# Changelog

## 2026-04-22

### Repo-root Cursor plugin promotion
- added a repo-root plugin manifest at `.cursor-plugin/plugin.json`
- added a minimal shipped plugin payload:
  - `rules/repo-owned-plugin-boundary.mdc`
  - `skills/local-plugin-check/SKILL.md`
- updated docs and validators so the repo now truthfully claims a small,
  checked-in Cursor plugin surface instead of only describing one

### Plugin install + smoke hardening
- added `scripts/install-local-plugin.sh` for reproducible local plugin setup
- added retry/backoff in `scripts/smoke-cursor-agent.sh` for transient
  connection-loss recovery in model-backed Cursor smoke
- refreshed benchmark evidence on top of the hardening commit so the checked-in
  proof matches the current install/smoke path
