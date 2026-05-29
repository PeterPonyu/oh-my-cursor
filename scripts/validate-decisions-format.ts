#!/usr/bin/env node
/**
 * Validate decision-record files (ADRs) under docs/decisions/.
 *
 * Usage:
 *   node --experimental-strip-types scripts/validate-decisions-format.ts [path-or-dir]
 *   node --experimental-strip-types scripts/validate-decisions-format.ts --self-test
 *
 * Each ADR is a markdown file at ``docs/decisions/YYYYMMDD-<slug>.md`` with
 * the frontmatter shown in ``docs/templates/decision.md``:
 *
 *   ---
 *   id: YYYYMMDD-short-slug
 *   title: One-line decision title
 *   status: proposed|accepted|rejected|deprecated|superseded
 *   date: YYYY-MM-DD
 *   supersedes: ""
 *   superseded_by: ""
 *   tags: []
 *   ---
 *
 * Requirements:
 *
 *   - filename matches ``id`` (without the ``.md`` extension)
 *   - filename starts with an ISO 8601 date (8 digits)
 *   - status is one of the five allowed values
 *   - if status == "superseded", ``superseded_by`` must be non-empty
 *   - the body contains Context / Decision / Consequences / Evidence headings
 *
 * ``--self-test`` mode is fully sandboxed under ``fs.mkdtempSync``.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const TEMPLATE_PATH = path.join(ROOT, 'docs', 'templates', 'decision.md');
const ALLOWED_STATUS = new Set(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded']);
const REQUIRED_HEADINGS = ['## Context', '## Decision', '## Consequences', '## Evidence'] as const;

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const FILENAME_RE = /^(\d{8})-([a-z0-9][a-z0-9-]*)\.md$/;

class ValidationError extends Error {
  readonly code: number;
  constructor(message: string, code: number = 1) {
    super(message);
    this.code = code;
  }
}

function _fail(message: string): never {
  process.stderr.write(`FAIL: ${message}\n`);
  throw new ValidationError(message, 1);
}

function _ok(message: string): void {
  process.stdout.write(`ok: ${message}\n`);
}

function _parseSimpleFrontmatter(text: string): Record<string, string> {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    _fail('decision file missing YAML frontmatter');
  }
  const fields: Record<string, string> = {};
  const body = m[1];
  for (const raw of body.split('\n')) {
    const stripped = raw.trim();
    if (!stripped || stripped.startsWith('#')) {
      continue;
    }
    if (!stripped.includes(':')) {
      _fail(`frontmatter line missing ':': ${stripped.slice(0, 120)}`);
    }
    const colonIdx = stripped.indexOf(':');
    const key = stripped.slice(0, colonIdx).trim();
    let value = stripped.slice(colonIdx + 1).trim();
    // Strip wrapping quotes (matches Python's .strip('"').strip("'") behavior)
    while (value.length > 0 && (value.startsWith('"') || value.endsWith('"'))) {
      if (value.startsWith('"')) value = value.slice(1);
      if (value.endsWith('"')) value = value.slice(0, -1);
      else break;
    }
    while (value.length > 0 && (value.startsWith("'") || value.endsWith("'"))) {
      if (value.startsWith("'")) value = value.slice(1);
      if (value.endsWith("'")) value = value.slice(0, -1);
      else break;
    }
    fields[key] = value;
  }
  return fields;
}

function _validateFile(filePath: string): void {
  const name = path.basename(filePath);
  const fnMatch = FILENAME_RE.exec(name);
  if (!fnMatch) {
    _fail(`decision filename must be YYYYMMDD-<slug>.md: ${name}`);
  }
  const expectedId = `${fnMatch[1]}-${fnMatch[2]}`;

  const text = fs.readFileSync(filePath, 'utf-8');
  const fields = _parseSimpleFrontmatter(text);

  for (const required of ['id', 'title', 'status', 'date', 'supersedes', 'superseded_by', 'tags']) {
    if (!(required in fields)) {
      _fail(`${name} frontmatter missing required key: ${required}`);
    }
  }

  if (fields.id !== expectedId) {
    _fail(`${name} frontmatter id='${fields.id}' does not match filename id '${expectedId}'`);
  }

  if (!ALLOWED_STATUS.has(fields.status)) {
    const sorted = Array.from(ALLOWED_STATUS).sort();
    const formatted = `[${sorted.map(s => `'${s}'`).join(', ')}]`;
    _fail(`${name} status='${fields.status}' not in ${formatted}`);
  }

  if (fields.status === 'superseded' && !fields.superseded_by) {
    _fail(`${name} is superseded but superseded_by is empty`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) {
    _fail(`${name} date='${fields.date}' must be ISO 8601 YYYY-MM-DD`);
  }

  for (const heading of REQUIRED_HEADINGS) {
    if (!text.includes(heading)) {
      _fail(`${name} body missing required heading: ${heading}`);
    }
  }
}

function _isTemplateFilename(name: string): boolean {
  // Templates use placeholder filenames; only validate the body when invoked
  // on the template directly.
  return name === 'decision.md';
}

function _validateTemplate(filePath: string): void {
  const text = fs.readFileSync(filePath, 'utf-8');
  const fields = _parseSimpleFrontmatter(text);
  const required = ['id', 'title', 'status', 'date', 'supersedes', 'superseded_by', 'tags'];
  const missing = required.filter(r => !(r in fields)).sort();
  if (missing.length > 0) {
    const formatted = `[${missing.map(m => `'${m}'`).join(', ')}]`;
    _fail(`template missing frontmatter keys: ${formatted}`);
  }
  for (const heading of REQUIRED_HEADINGS) {
    if (!text.includes(heading)) {
      _fail(`template body missing required heading: ${heading}`);
    }
  }
}

function validate(target: string): void {
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(target);
  } catch {
    _fail(`decision file not found: ${target}`);
  }

  if (stat!.isDirectory()) {
    const entries = fs.readdirSync(target)
      .filter(f => f.endsWith('.md') && !_isTemplateFilename(f))
      .sort();
    if (entries.length === 0) {
      _ok(`no decision files in ${target}; nothing to validate`);
      return;
    }
    for (const entry of entries) {
      _validateFile(path.join(target, entry));
    }
    _ok(`validated ${entries.length} decision file(s) in ${target}`);
    return;
  }

  if (!stat!.isFile()) {
    _fail(`decision file not found: ${target}`);
  }
  const baseName = path.basename(target);
  if (_isTemplateFilename(baseName)) {
    _validateTemplate(target);
    _ok(`decision template is valid: ${target}`);
    return;
  }
  _validateFile(target);
  _ok(`decision file is valid: ${target}`);
}

// --self-test

const _CLEAN_FIXTURE = [
  '---',
  'id: 20260520-memory-layer-design',
  'title: Adopt three-section notepad and append-only wiki',
  'status: accepted',
  'date: 2026-05-20',
  'supersedes: ""',
  'superseded_by: ""',
  'tags: [memory, design]',
  '---',
  '',
  '# 20260520-memory-layer-design: Adopt three-section notepad and append-only wiki',
  '',
  '## Context',
  'Repo lacked a memory layer.',
  '',
  '## Decision',
  'Adopt the OMC-derived three-section notepad and a flat wiki under docs/wiki/.',
  '',
  '## Consequences',
  'Plugin payload grows by ~10 KiB of templates; validators add ~600 LoC.',
  '',
  '## Evidence',
  'See PR #N.',
  '',
].join('\n');

function _runSelfTest(): number {
  const td = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-decisions-'));
  try {
    const decisions = path.join(td, 'decisions');
    fs.mkdirSync(decisions);

    const clean = path.join(decisions, '20260520-memory-layer-design.md');
    fs.writeFileSync(clean, _CLEAN_FIXTURE, 'utf-8');
    validate(clean);

    const badFilename = path.join(decisions, 'memory-layer.md');
    fs.writeFileSync(badFilename, _CLEAN_FIXTURE, 'utf-8');
    try {
      validate(badFilename);
      process.stderr.write('FAIL: bad-filename not detected\n');
      return 1;
    } catch (exc) {
      if (!(exc instanceof ValidationError) || exc.code !== 1) {
        return 1;
      }
      _ok('self-test detected bad-filename');
    }
    fs.unlinkSync(badFilename);

    const badStatus = path.join(decisions, '20260520-bad-status.md');
    fs.writeFileSync(
      badStatus,
      _CLEAN_FIXTURE
        .replace('id: 20260520-memory-layer-design', 'id: 20260520-bad-status')
        .replace('status: accepted', 'status: maybe'),
      'utf-8',
    );
    try {
      validate(badStatus);
      process.stderr.write('FAIL: bad-status not detected\n');
      return 1;
    } catch (exc) {
      if (!(exc instanceof ValidationError) || exc.code !== 1) {
        return 1;
      }
      _ok('self-test detected bad-status');
    }
    fs.unlinkSync(badStatus);

    const supersededOrphan = path.join(decisions, '20260520-orphaned.md');
    fs.writeFileSync(
      supersededOrphan,
      _CLEAN_FIXTURE
        .replace('id: 20260520-memory-layer-design', 'id: 20260520-orphaned')
        .replace('status: accepted', 'status: superseded'),
      'utf-8',
    );
    try {
      validate(supersededOrphan);
      process.stderr.write('FAIL: superseded-without-superseded_by not detected\n');
      return 1;
    } catch (exc) {
      if (!(exc instanceof ValidationError) || exc.code !== 1) {
        return 1;
      }
      _ok('self-test detected superseded-without-superseded_by');
    }
    fs.unlinkSync(supersededOrphan);
  } finally {
    fs.rmSync(td, { recursive: true, force: true });
  }

  let templateStat: fs.Stats | null = null;
  try {
    templateStat = fs.statSync(TEMPLATE_PATH);
  } catch {
    // missing
  }
  if (templateStat && templateStat.isFile()) {
    validate(TEMPLATE_PATH);
    _ok(`shipped template passes: ${path.relative(ROOT, TEMPLATE_PATH)}`);
  } else {
    process.stderr.write(`FAIL: shipped template missing: ${TEMPLATE_PATH}\n`);
    return 1;
  }

  process.stdout.write('VALIDATE_DECISIONS_FORMAT_SELF_TEST_OK\n');
  return 0;
}

function main(argv?: string[]): number {
  const args = argv ?? process.argv.slice(2);
  if (args.includes('--self-test')) {
    try {
      return _runSelfTest();
    } catch (exc) {
      if (exc instanceof ValidationError) {
        return exc.code;
      }
      throw exc;
    }
  }
  const target = args.length > 0 ? args[0] : path.join(ROOT, 'docs', 'decisions');
  const exists = fs.existsSync(target);
  try {
    if (!exists) {
      let templateExists = false;
      try {
        templateExists = fs.statSync(TEMPLATE_PATH).isFile();
      } catch {
        templateExists = false;
      }
      if (templateExists) {
        validate(TEMPLATE_PATH);
      } else {
        _fail(`no decisions dir at ${target} and shipped template missing: ${TEMPLATE_PATH}`);
      }
      process.stdout.write('VALIDATE_DECISIONS_FORMAT_OK\n');
      return 0;
    }
    validate(target);
    process.stdout.write('VALIDATE_DECISIONS_FORMAT_OK\n');
    return 0;
  } catch (exc) {
    if (exc instanceof ValidationError) {
      return exc.code;
    }
    throw exc;
  }
}

process.exit(main());
