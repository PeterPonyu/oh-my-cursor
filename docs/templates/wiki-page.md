---
slug: short-slug
title: Page title
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: []
---

# Page title

> Copy this template to `docs/wiki/<slug>.md`. `slug` must match the
> filename without extension. `scripts/validate-wiki-structure.ts` enforces
> the frontmatter and a maximum page size of 10 KiB (matching the wiki
> defaults in the audit reports).

## Summary

One short paragraph. What is this page about?

## Detail

Section bodies. Use wiki-style links like `[[other-slug]]` to reference
other pages; `scripts/validate-wiki-structure.ts` does not resolve them,
but it warns if a referenced slug is not present in the index.

## Sources

- Paths to files, PRs, or external links that justify the content.
