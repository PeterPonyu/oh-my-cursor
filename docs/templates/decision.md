---
id: YYYYMMDD-short-slug
title: One-line decision title
status: proposed
date: YYYY-MM-DD
supersedes: ""
superseded_by: ""
tags: []
---

# YYYYMMDD-short-slug: One-line decision title

> Copy this template to `docs/decisions/YYYYMMDD-<slug>.md`. The filename
> must match the `id` field and follow ISO 8601 date-first naming so that
> `ls docs/decisions/` orders chronologically. `scripts/validate-decisions-format.ts`
> reads the frontmatter and enforces the `status` enum.

## Context

What is the problem? What constraints drive this decision? Cite files,
issues, or prior decisions by relative path.

## Decision

What did we decide? Be specific. Name the libraries, file paths, or
contracts you committed to.

## Consequences

What changes? What gets harder? What gets easier? List both positive and
negative effects so future maintainers see the full picture.

## Evidence

Link to the commits, PRs, or measurements that justify this decision. If
there is no evidence yet, set `status: proposed`. Promote to
`status: accepted` only when at least one piece of evidence exists.

---

## Allowed `status` values

`proposed`, `accepted`, `rejected`, `deprecated`, `superseded`.

Use `superseded` together with the `superseded_by` field pointing at the
later decision's filename (without path).
