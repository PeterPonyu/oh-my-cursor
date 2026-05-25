# Wiki index

> Copy to `docs/wiki/index.md`. Every wiki page should be linkable from
> here. `scripts/validate-wiki-structure.py` checks that this file exists
> and that every `.md` page (other than `index.md` and `log.md`) is
> referenced from this index.

## Sections

- Architecture
- Conventions
- Runbooks
- External services

## Pages

<!-- One bullet per page. Use double brackets for wiki-style links: -->
<!-- - [[architecture-overview]] -->
<!-- - [[conventions-python]] -->
<!-- - [[runbook-incident-response]] -->

## How to add a page

1. Run the `wiki` skill or copy `docs/templates/wiki-page.md` to
   `docs/wiki/<slug>.md`.
2. Add a line to the Pages list above.
3. Append a short entry to `docs/wiki/log.md` (use the template at
   `docs/templates/wiki-log.md`).
4. Run `python3 scripts/validate-wiki-structure.py`.
