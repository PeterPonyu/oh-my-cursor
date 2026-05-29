#!/usr/bin/env node
/**
 * Validate a wiki directory against the repo contract.
 *
 * Usage:
 *   node --experimental-strip-types scripts/validate-wiki-structure.ts [wiki-dir]
 *   node --experimental-strip-types scripts/validate-wiki-structure.ts --self-test
 *
 * The wiki contract:
 *
 *   - <dir>/index.md exists
 *   - <dir>/log.md exists and is sorted by timestamp non-decreasing
 *   - each <dir>/<slug>.md (other than index.md, log.md) has the YAML
 *     frontmatter shown in docs/templates/wiki-page.md and is <= 10 KiB
 *   - the optional <dir>/archive/ directory is not validated for size
 *
 * ``--self-test`` mode runs everything under an ephemeral temporary
 * directory; it never mutates the working tree.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const TEMPLATE_INDEX = path.join(ROOT, 'docs', 'templates', 'wiki-index.md');
const TEMPLATE_PAGE = path.join(ROOT, 'docs', 'templates', 'wiki-page.md');
const TEMPLATE_LOG = path.join(ROOT, 'docs', 'templates', 'wiki-log.md');

const MAX_PAGE_BYTES = 10 * 1024; // 10 KiB

const LOG_ENTRY_RE =
  /^(?<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+(?<action>add|update|archive)\s+(?<slug>[a-z0-9][a-z0-9-]*)\s+\S.*$/;

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const REQUIRED_PAGE_KEYS = new Set(['slug', 'title', 'created', 'updated', 'tags']);

class ValidationError extends Error {}

function fail(message: string): never {
  process.stderr.write(`FAIL: ${message}\n`);
  throw new ValidationError(message);
}

function ok(message: string): void {
  process.stdout.write(`ok: ${message}\n`);
}

function relativeToRoot(p: string): string {
  return path.relative(ROOT, p);
}

function parseSimpleFrontmatter(text: string): Record<string, string> | null {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    return null;
  }
  const fields: Record<string, string> = {};
  for (const raw of m[1].split('\n')) {
    const stripped = raw.trim();
    if (!stripped || stripped.startsWith('#')) {
      continue;
    }
    if (!stripped.includes(':')) {
      fail(`frontmatter line missing ':' separator: ${stripped.slice(0, 120)}`);
    }
    const colonIdx = stripped.indexOf(':');
    const key = stripped.slice(0, colonIdx).trim();
    const value = stripped.slice(colonIdx + 1).trim();
    fields[key] = value;
  }
  return fields;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function validateIndex(filePath: string): void {
  if (!isFile(filePath)) {
    fail(`wiki index missing: ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf-8');
  if (!text.includes('# Wiki index') && !text.includes('## Pages')) {
    fail("wiki index must contain a '# Wiki index' heading and a '## Pages' section");
  }
}

function validateLog(filePath: string): void {
  if (!isFile(filePath)) {
    fail(`wiki log missing: ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf-8');
  const entries: string[] = [];
  for (const raw of text.split('\n')) {
    const stripped = raw.trim();
    if (!stripped || stripped.startsWith('#') || stripped.startsWith('<!--')) {
      continue;
    }
    if (stripped.startsWith('```') || stripped === 'Format') {
      continue;
    }
    if (stripped.startsWith('YYYY-MM-DDTHH')) {
      // The template shows the format inside a fenced code block; skip
      continue;
    }
    const m = LOG_ENTRY_RE.exec(stripped);
    if (!m) {
      fail(`wiki log entry does not match contract: ${stripped.slice(0, 120)}`);
    }
    entries.push(m.groups!.ts);
  }
  const sorted = [...entries].sort();
  for (let i = 0; i < entries.length; i++) {
    if (entries[i] !== sorted[i]) {
      fail('wiki log entries are not sorted non-decreasing by timestamp');
    }
  }
}

function validatePage(filePath: string): void {
  const size = fs.statSync(filePath).size;
  const name = path.basename(filePath);
  if (size > MAX_PAGE_BYTES) {
    fail(`wiki page ${name} is ${size} bytes; cap is ${MAX_PAGE_BYTES}`);
  }
  const text = fs.readFileSync(filePath, 'utf-8');
  const fields = parseSimpleFrontmatter(text);
  if (fields === null) {
    fail(`wiki page ${name} missing frontmatter`);
  }
  const missing: string[] = [];
  for (const key of REQUIRED_PAGE_KEYS) {
    if (!(key in fields)) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    missing.sort();
    fail(`wiki page ${name} missing frontmatter keys: [${missing.map(k => `'${k}'`).join(', ')}]`);
  }
}

function validate(wikiDir: string): void {
  if (!isDir(wikiDir)) {
    fail(`wiki directory not found: ${wikiDir}`);
  }
  validateIndex(path.join(wikiDir, 'index.md'));
  validateLog(path.join(wikiDir, 'log.md'));
  const entries = fs.readdirSync(wikiDir);
  const pages = entries
    .filter(name => name.endsWith('.md') && name !== 'index.md' && name !== 'log.md')
    .filter(name => isFile(path.join(wikiDir, name)))
    .sort()
    .map(name => path.join(wikiDir, name));
  for (const page of pages) {
    validatePage(page);
  }
  const plural = pages.length !== 1 ? 's' : '';
  ok(`wiki structure is valid (${pages.length} page${plural}): ${wikiDir}`);
}

// --self-test

const CLEAN_INDEX =
  `# Wiki index

## Sections

- Architecture

## Pages

- [[architecture-overview]]
`;

const CLEAN_LOG =
  `# Wiki log

2026-05-20T15:00:00Z  add     architecture-overview  initial draft
2026-05-20T16:00:00Z  update  architecture-overview  add module map
`;

const CLEAN_PAGE =
  `---
slug: architecture-overview
title: Architecture overview
created: 2026-05-20
updated: 2026-05-20
tags: []
---

# Architecture overview

## Summary

One paragraph.
`;

function seedCleanWiki(root: string): string {
  const wiki = path.join(root, 'wiki');
  fs.mkdirSync(wiki);
  fs.writeFileSync(path.join(wiki, 'index.md'), CLEAN_INDEX, 'utf-8');
  fs.writeFileSync(path.join(wiki, 'log.md'), CLEAN_LOG, 'utf-8');
  fs.writeFileSync(path.join(wiki, 'architecture-overview.md'), CLEAN_PAGE, 'utf-8');
  return wiki;
}

function expectFail(label: string, fn: () => void): number {
  try {
    fn();
  } catch (exc) {
    if (exc instanceof ValidationError) {
      ok(`self-test detected ${label}`);
      return 0;
    }
    process.stderr.write(`FAIL: self-test ${label}: unexpected error: ${exc}\n`);
    return 1;
  }
  process.stderr.write(`FAIL: self-test ${label}: validator did not detect the problem\n`);
  return 1;
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-wiki-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runSelfTest(): number {
  let rc = withTempDir(td => {
    const wiki = seedCleanWiki(td);
    try {
      validate(wiki);
    } catch (exc) {
      if (exc instanceof ValidationError) {
        process.stderr.write(`FAIL: self-test clean wiki: ${exc.message}\n`);
        return 1;
      }
      throw exc;
    }
    ok('self-test clean wiki passes');
    return 0;
  });
  if (rc !== 0) return rc;

  rc = withTempDir(td => {
    const wiki = seedCleanWiki(td);
    fs.writeFileSync(
      path.join(wiki, 'log.md'),
      '2026-05-20T16:00:00Z  update  architecture-overview  out of order\n' +
        '2026-05-20T15:00:00Z  add     architecture-overview  initial\n',
      'utf-8',
    );
    return expectFail('log-out-of-order', () => validate(wiki));
  });
  if (rc !== 0) return rc;

  rc = withTempDir(td => {
    const wiki = seedCleanWiki(td);
    fs.writeFileSync(path.join(wiki, 'no-frontmatter.md'), '# Body only\n', 'utf-8');
    return expectFail('page-missing-frontmatter', () => validate(wiki));
  });
  if (rc !== 0) return rc;

  rc = withTempDir(td => {
    const wiki = seedCleanWiki(td);
    const big = CLEAN_PAGE.replace('One paragraph.', 'x'.repeat(MAX_PAGE_BYTES + 1024));
    fs.writeFileSync(path.join(wiki, 'oversized.md'), big, 'utf-8');
    return expectFail('page-too-large', () => validate(wiki));
  });
  if (rc !== 0) return rc;

  // The shipped templates are individual files, not a wiki; smoke-check
  // they parse with the same helpers they exist to seed.
  for (const p of [TEMPLATE_INDEX, TEMPLATE_PAGE, TEMPLATE_LOG]) {
    if (!isFile(p)) {
      process.stderr.write(`FAIL: shipped template missing: ${p}\n`);
      return 1;
    }
    ok(`shipped template present: ${relativeToRoot(p)}`);
  }

  const pageFields = parseSimpleFrontmatter(fs.readFileSync(TEMPLATE_PAGE, 'utf-8'));
  if (pageFields === null) {
    process.stderr.write('FAIL: shipped wiki-page template missing required frontmatter keys\n');
    return 1;
  }
  for (const key of REQUIRED_PAGE_KEYS) {
    if (!(key in pageFields)) {
      process.stderr.write('FAIL: shipped wiki-page template missing required frontmatter keys\n');
      return 1;
    }
  }
  ok('shipped wiki-page template has all required frontmatter keys');

  process.stdout.write('VALIDATE_WIKI_STRUCTURE_SELF_TEST_OK\n');
  return 0;
}

function exists(p: string): boolean {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

export function main(argv?: string[]): number {
  const args = argv ?? process.argv.slice(2);
  if (args.includes('--self-test')) {
    return runSelfTest();
  }
  const target = args.length > 0 ? path.resolve(args[0]) : path.join(ROOT, 'docs', 'wiki');
  if (!exists(target)) {
    // No live wiki; degrade to template smoke check rather than a hard fail.
    try {
      for (const p of [TEMPLATE_INDEX, TEMPLATE_PAGE, TEMPLATE_LOG]) {
        if (!isFile(p)) {
          fail(`no wiki at ${target} and shipped template missing: ${p}`);
        }
      }
    } catch (exc) {
      if (exc instanceof ValidationError) return 1;
      throw exc;
    }
    ok(`no wiki at ${target}; shipped templates present`);
    process.stdout.write('VALIDATE_WIKI_STRUCTURE_OK\n');
    return 0;
  }
  try {
    validate(target);
  } catch (exc) {
    if (exc instanceof ValidationError) return 1;
    throw exc;
  }
  process.stdout.write('VALIDATE_WIKI_STRUCTURE_OK\n');
  return 0;
}

// Run when invoked as a script.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === currentFile;
if (invokedDirectly) {
  process.exit(main());
}
