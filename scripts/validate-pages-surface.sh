#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf 'ok: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
bounded() { printf 'bounded: %s\n' "$*"; }

SITE_ROOT="apps/cursor-backbone-site"
WORKFLOW=".github/workflows/deploy-pages.yml"
EXPORT_HTML="$SITE_ROOT/out/index.html"

if [[ ! -d "$SITE_ROOT" ]]; then
  bounded "no repo-owned Pages app checked in at $SITE_ROOT; landing-surface proof remains inactive"
  exit 0
fi

required_app_files=(
  "$SITE_ROOT/package.json"
  "$SITE_ROOT/pnpm-lock.yaml"
  "$SITE_ROOT/pnpm-workspace.yaml"
  "$SITE_ROOT/eslint.config.mjs"
  "$SITE_ROOT/tsconfig.json"
  "$SITE_ROOT/next-env.d.ts"
  "$SITE_ROOT/next.config.ts"
  "$SITE_ROOT/app/layout.tsx"
  "$SITE_ROOT/app/page.tsx"
)

for path in "${required_app_files[@]}"; do
  [[ -f "$path" ]] || fail "missing required landing-surface file: $path"
  log "$path"
done

[[ -f "$WORKFLOW" ]] || fail "missing Pages deploy workflow: $WORKFLOW"
log "$WORKFLOW"

grep -Eq "output:\\s*'export'|output:\\s*\"export\"" "$SITE_ROOT/next.config.ts" \
  || fail "next.config.ts must keep output: 'export'"
log "next.config.ts keeps static export output"

grep -Eq 'actions/upload-pages-artifact@v[0-9]+' "$WORKFLOW" \
  || fail "deploy workflow must use actions/upload-pages-artifact"
grep -Eq 'actions/deploy-pages@v[0-9]+' "$WORKFLOW" \
  || fail "deploy workflow must use actions/deploy-pages"
grep -q "$SITE_ROOT/out" "$WORKFLOW" \
  || fail "deploy workflow must upload $SITE_ROOT/out"
log "deploy workflow uses official Pages artifact/deploy actions"

[[ -f "$EXPORT_HTML" ]] || fail "missing exported landing HTML: $EXPORT_HTML (run the site build first)"
log "$EXPORT_HTML"

grep -qi 'oh-my-cursor' "$EXPORT_HTML" \
  || fail "exported landing HTML must lead with oh-my-cursor naming"
grep -qi '>Docs<' "$EXPORT_HTML" \
  || fail "exported landing HTML must keep a visible Docs link"
grep -qi '>State Contract<' "$EXPORT_HTML" \
  || fail "exported landing HTML must keep a visible State Contract link"
grep -qi '>References<' "$EXPORT_HTML" \
  || fail "exported landing HTML must keep a visible References link"
grep -qi '>Benchmark Notes<' "$EXPORT_HTML" \
  || fail "exported landing HTML must keep a visible Benchmark Notes link"
grep -qi 'oh-my-copilot' "$EXPORT_HTML" \
  || fail "exported landing HTML must include the sibling oh-my-copilot link"

for term in repo-owned host-product-only unsupported-or-out-of-scope; do
  grep -qi "$term" "$EXPORT_HTML" \
    || fail "exported landing HTML must preserve the visible ownership term: $term"
done

log "exported landing HTML preserves required naming, proof links, sibling link, and ownership terms"
