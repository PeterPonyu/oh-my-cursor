# Test Spec — oh-my-cursor plugin promotion

## Automated
- `./scripts/verify-backbone.sh`
- `./scripts/validate-surface-visibility.sh`
- `./scripts/validate-pages-surface.sh`
- `./scripts/validate-state-contract.sh`
- updated/new plugin-structure validation

## Manual
1. Symlink or copy repo to `~/.cursor/plugins/local/oh-my-cursor`.
2. Confirm `.cursor-plugin/plugin.json` exists at plugin root.
3. Restart Cursor or use Developer: Reload Window.
4. Verify shipped plugin components load.
