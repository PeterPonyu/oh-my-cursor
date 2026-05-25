# Wiki log

> Copy to `docs/wiki/log.md`. This file is **append-only**. Every wiki
> mutation (add page, update page, archive page) appends one line below.
> `scripts/validate-wiki-structure.py` checks that this file exists and
> that lines are sorted by timestamp (non-decreasing).

## Format

Each entry is one line:

```
YYYY-MM-DDTHH:MM:SSZ  <action>  <slug>  <note>
```

Where `action` is one of `add`, `update`, `archive`. `slug` is the wiki
page slug (without extension). `note` is a short freeform string.

## Entries

<!-- Example: -->
<!-- 2026-05-20T15:00:00Z  add     architecture-overview  initial draft -->
<!-- 2026-05-20T16:30:00Z  update  architecture-overview  add module map -->
