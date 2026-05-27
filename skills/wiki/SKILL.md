---
name: wiki
description: "[OMCS] Markdown wiki lifecycle skill — add/update/list/search/log pages under docs/wiki/ with an append-only log and no embeddings."
---

# Wiki

The wiki is a directory of markdown pages at `./docs/wiki/` with:

- `index.md` listing every active page,
- `log.md` recording every mutation (append-only, sorted by timestamp),
- one `<slug>.md` per topic.

No embeddings, no vector store. Search is `grep` / `rg` on disk. This is
intentional: the wiki is for facts an agent needs to look up by topic;
it is not a chatbot.

The templates live at `docs/templates/wiki-index.md`, `wiki-page.md`,
and `wiki-log.md`. Format is enforced by
`scripts/validate-wiki-structure.py`.

## When to use

- A piece of codebase knowledge that future agents (and humans) will need
  to look up by topic: architecture overview, conventions for a module,
  runbooks, external-service integration notes.
- A finding from `remember` was routed to the wiki.

## Skip when

- The fact is task-life and short-lived → notepad.
- The fact is a structured project attribute → project memory.
- The fact is an architectural decision → decisions.
- The content is already in `README.md` or another `docs/` page —
  link from the wiki page instead of duplicating.

## Steps

### Bootstrap the wiki

If `./docs/wiki/` does not exist:

1. Create the directory.
2. Copy `docs/templates/wiki-index.md` to `./docs/wiki/index.md`.
3. Copy `docs/templates/wiki-log.md` to `./docs/wiki/log.md`.
4. Run `node --experimental-strip-types scripts/validate-wiki-structure.ts`.

### Add a page

1. Pick a kebab-case slug. Filename: `./docs/wiki/<slug>.md`.
2. Copy `docs/templates/wiki-page.md` to that path.
3. Edit the frontmatter (`slug`, `title`, `created`, `updated`, `tags`).
4. Write the body. Keep the page under 10 KiB.
5. Add a bullet to `./docs/wiki/index.md`'s Pages list.
6. Append one line to `./docs/wiki/log.md`:
   `YYYY-MM-DDTHH:MM:SSZ  add  <slug>  <short note>`.
7. Run `node --experimental-strip-types scripts/validate-wiki-structure.ts`.

### Update a page

1. Edit the page body. Update the `updated` frontmatter field to today.
2. Append one line to `log.md`:
   `YYYY-MM-DDTHH:MM:SSZ  update  <slug>  <short note>`.
3. Run the validator.

### Archive a page

1. Move `<slug>.md` into `./docs/wiki/archive/` (create the dir if
   missing).
2. Remove its bullet from `index.md`.
3. Append `YYYY-MM-DDTHH:MM:SSZ  archive  <slug>  <reason>` to `log.md`.
4. Run the validator. (Archived pages are not validated for size; they
   are historical.)

### Search

Use `rg`:

```
rg -n "<query>" ./docs/wiki
```

For a topic lookup, list pages by slug:

```
ls ./docs/wiki | grep -v -E 'index|log|archive'
```

## Anti-patterns

- Editing `log.md` out of timestamp order. The validator rejects it.
- Editing a page without bumping `updated` in the frontmatter.
- Embedding base64 binary blobs to make a "richer" wiki. Wiki is
  human-readable markdown.
- Trying to install vector search. Out of scope; the audit explicitly
  rules it out.
- Editing the wiki from a hook.

## Optional MCP integration

If the bridge is installed with `--with-mcp`:

| Tool | Effect |
|------|--------|
| `memory_wiki_log_append` | Appends a single entry to `docs/wiki/log.md` atomically |

## Governance

### Ownership Class

- **repo-owned**: YES — Checked in at `skills/wiki/SKILL.md`.
- **host-product-only**: NO
- **unsupported-or-out-of-scope**: NO

### Proof Class

- **official-doc**: NO — repo-owned.
- **checked-in-artifact**: YES — Proof: `skills/wiki/SKILL.md`,
  `docs/templates/wiki-index.md`, `wiki-page.md`, `wiki-log.md`,
  `scripts/validate-wiki-structure.py`,
  `tests/memory/test_validate_wiki_structure.py`.
- **runtime-smoke**: YES (optional) — with `--with-mcp`.

### Claim Summary

`wiki` is the lifecycle skill for `./docs/wiki/`. It defines a small,
strict directory shape (`index.md`, `log.md`, `<slug>.md` pages) with
append-only audit and a 10 KiB page cap. No embeddings; search is grep.

## MCP Integration Points

| Tool/Resource | MCP Server | Purpose | Required |
|---|---|---|---|
| `memory_wiki_log_append` | cursor-state-bridge (with-mcp) | Append a wiki log entry | No |

## Hooks Dependencies

None.

## Orchestration Role

- **Lifecycle phase(s)**: any (most useful at the end of `verify` /
  `review` when a finding is durable)
- **Invoked by**: `remember` (router), user
- **Invokes**: `scripts/validate-wiki-structure.py` after each write
- **State contract**: Operates on `./docs/wiki/`; never touches
  workflow-state
- **Failure handling**: Validator failure ⇒ revert and surface the error
