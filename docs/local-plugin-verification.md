# Local Plugin Verification

This document records the reproducible local-load path for the repo-root
`oh-my-cursor` plugin.

## Goal

Verify that the checked-in plugin surface can be loaded from Cursor's local
plugin directory without claiming more automation than the repo actually owns.

## Manual verification steps

1. Copy or symlink this repository to:
   `~/.cursor/plugins/local/oh-my-cursor`
2. Confirm the plugin root contains:
   - `.cursor-plugin/plugin.json`
   - the shipped plugin rules
   - at least one shipped plugin skill
3. Start Cursor, or run **Developer: Reload Window** if Cursor is already open.
4. Open the local plugin workspace and confirm the shipped plugin components are
   visible/active.
5. If validation notes or screenshots are collected, store them as proof
   artifacts rather than upgrading docs by memory alone.

## Verification boundaries

- The walkthrough itself is a **repo-owned** checked-in document.
- The local install path under `~/.cursor/plugins/local` belongs to the **user
  environment**, not the repo.
- Reloading Cursor is a **manual product action**, not repo-owned automation.
- If a future automated smoke is added, it should strengthen wording only after
  the smoke is reproducible and checked in.

## What stays deferred

The local plugin walkthrough does **not** by itself prove or imply:

- default MCP configuration;
- checked-in hook manifests;
- checked-in custom-agent surfaces;
- repo-file custom mode provisioning; or
- marketplace publication.

## Suggested evidence to capture

When running the manual workflow, record at least:

- the absolute local plugin path used;
- whether the load used a copy or a symlink;
- whether Cursor required a full restart or only **Developer: Reload Window**;
- which plugin files were present; and
- any mismatch between the docs and the actual visible plugin surface.
