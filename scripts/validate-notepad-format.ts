#!/usr/bin/env node
/**
 * Validate a notepad markdown file against the three-section contract.
 *
 * Usage:
 *   node --experimental-strip-types scripts/validate-notepad-format.ts [path]
 *   node --experimental-strip-types scripts/validate-notepad-format.ts --self-test
 *
 * The notepad has three marker-bounded sections:
 *
 *   ## Priority Context
 *   <!-- OMCS:NOTEPAD:PRIORITY -->
 *   ...body (replace-on-write, max 500 chars between markers)...
 *   <!-- /OMCS:NOTEPAD:PRIORITY -->
 *
 *   ## Working Memory
 *   <!-- OMCS:NOTEPAD:WORKING -->
 *   ...body (timestamped lines, append-only)...
 *   <!-- /OMCS:NOTEPAD:WORKING -->
 *
 *   ## MANUAL
 *   <!-- OMCS:NOTEPAD:MANUAL -->
 *   ...body (never auto-pruned)...
 *   <!-- /OMCS:NOTEPAD:MANUAL -->
 *
 * The validator uses only Node.js built-ins so it runs anywhere
 * ``node`` is available. ``--self-test`` mode seeds a clean fixture and
 * four negative fixtures in an ``os.tmpdir()`` + ``fs.mkdtempSync()``
 * sandbox and confirms each behaves as expected. The working tree is
 * never mutated.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const TEMPLATE_PATH = path.join(ROOT, 'docs', 'templates', 'notepad.md');
const PRIORITY_CAP = 500;
const WORKING_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+\S.*$/;

// Section markers; the validator only inspects bodies between START and END.
type SectionKey = 'priority' | 'working' | 'manual';
type Section = readonly [SectionKey, string, string, string];

const SECTIONS: readonly Section[] = [
  ['priority', '## Priority Context', '<!-- OMCS:NOTEPAD:PRIORITY -->', '<!-- /OMCS:NOTEPAD:PRIORITY -->'],
  ['working', '## Working Memory', '<!-- OMCS:NOTEPAD:WORKING -->', '<!-- /OMCS:NOTEPAD:WORKING -->'],
  ['manual', '## MANUAL', '<!-- OMCS:NOTEPAD:MANUAL -->', '<!-- /OMCS:NOTEPAD:MANUAL -->'],
];

class ValidationError extends Error {
  readonly code: number;
  constructor(message: string, code = 1) {
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

function _extractSection(text: string, header: string, startMarker: string, endMarker: string): string {
  if (!text.includes(header)) {
    _fail(`missing required header: ${header}`);
  }
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);
  if (startIdx === -1) {
    _fail(`missing start marker: ${startMarker}`);
  }
  if (endIdx === -1) {
    _fail(`missing end marker: ${endMarker}`);
  }
  if (endIdx <= startIdx) {
    _fail(`end marker '${endMarker}' precedes start marker '${startMarker}'`);
  }
  return text.slice(startIdx + startMarker.length, endIdx);
}

function _stripCommentLines(body: string): string {
  /**
   * Return the non-comment body content used for cap calculations.
   *
   * The templates use HTML comments inside section bodies to give
   * instructions. Those comment lines do not count toward the cap so
   * the out-of-the-box template doesn't trip the cap before any real
   * content has been added.
   */
  const kept: string[] = [];
  for (const raw of body.split('\n')) {
    const stripped = raw.trim();
    if (!stripped) continue;
    if (stripped.startsWith('<!--') && stripped.endsWith('-->')) continue;
    kept.push(raw);
  }
  return kept.join('\n');
}

function _validatePriority(body: string): void {
  const payload = _stripCommentLines(body);
  if (payload.length > PRIORITY_CAP) {
    _fail(
      `Priority Context exceeds ${PRIORITY_CAP}-char cap: ${payload.length} chars present`,
    );
  }
}

function _validateWorking(body: string): void {
  const payloadLines: string[] = [];
  for (const raw of body.split('\n')) {
    const stripped = raw.trim();
    if (!stripped) continue;
    if (stripped.startsWith('<!--') && stripped.endsWith('-->')) continue;
    payloadLines.push(stripped);
  }
  const timestamps: string[] = [];
  for (let i = 0; i < payloadLines.length; i++) {
    const line = payloadLines[i];
    const m = line.match(WORKING_TIMESTAMP_RE);
    if (!m) {
      _fail(
        `Working Memory line ${i + 1} does not start with an ISO 8601 UTC timestamp: ${line.slice(0, 120)}`,
      );
    }
    timestamps.push(m[1]);
  }
  const sorted = [...timestamps].sort();
  if (timestamps.length !== sorted.length || timestamps.some((t, i) => t !== sorted[i])) {
    _fail('Working Memory timestamps are not sorted non-decreasing');
  }
}

function _validateManual(body: string): void {
  // MANUAL has no cap and no strict format. We only require the markers
  // exist (already checked) and the body is parseable as text.
  if (body.includes('\x00')) {
    _fail('MANUAL section contains a null byte');
  }
}

function validate(filePath: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    _fail(`notepad file not found: ${filePath}`);
  }
  if (!stat.isFile()) {
    _fail(`notepad file not found: ${filePath}`);
  }
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch (exc: any) {
    _fail(`could not read ${filePath}: ${exc?.message ?? exc}`);
  }
  for (const [key, header, startMarker, endMarker] of SECTIONS) {
    const body = _extractSection(text, header, startMarker, endMarker);
    if (key === 'priority') {
      _validatePriority(body);
    } else if (key === 'working') {
      _validateWorking(body);
    } else if (key === 'manual') {
      _validateManual(body);
    }
  }
  _ok(`notepad format is valid: ${filePath}`);
}

// --self-test (V2 tempdir isolation)

const _CLEAN_FIXTURE =
  `# Project notepad

## Priority Context

<!-- OMCS:NOTEPAD:PRIORITY -->
Working on the memory layer refactor; bridge tools optional.
<!-- /OMCS:NOTEPAD:PRIORITY -->

## Working Memory

<!-- OMCS:NOTEPAD:WORKING -->
2026-05-20T15:00:00Z added validate-notepad-format
2026-05-20T15:30:00Z added pytest coverage
<!-- /OMCS:NOTEPAD:WORKING -->

## MANUAL

<!-- OMCS:NOTEPAD:MANUAL -->
Never edit workflow-state.json by hand.
<!-- /OMCS:NOTEPAD:MANUAL -->
`;

const _BAD_MISSING_HEADER = _CLEAN_FIXTURE.replace('## Priority Context', '## Priorities');
const _BAD_OVERSIZED_PRIORITY = _CLEAN_FIXTURE.replace(
  'Working on the memory layer refactor; bridge tools optional.',
  'x'.repeat(PRIORITY_CAP + 1),
);
const _BAD_UNTIMESTAMPED_WORKING = _CLEAN_FIXTURE.replace(
  '2026-05-20T15:00:00Z added validate-notepad-format',
  'added validate-notepad-format (no timestamp)',
);
const _BAD_NONMONOTONIC_WORKING = _CLEAN_FIXTURE.replace(
  '2026-05-20T15:00:00Z added validate-notepad-format\n' +
    '2026-05-20T15:30:00Z added pytest coverage',
  '2026-05-20T15:30:00Z added pytest coverage\n' +
    '2026-05-20T15:00:00Z added validate-notepad-format',
);
if (
  !_BAD_NONMONOTONIC_WORKING.includes(
    '2026-05-20T15:30:00Z added pytest coverage\n2026-05-20T15:00:00Z added validate-notepad-format',
  )
) {
  throw new Error('self-test fixture substitution did not land; check whitespace');
}

type ValidationResult = { ok: true; code?: never } | { ok: false; code: number };

function _safeValidate(filePath: string): ValidationResult {
  try {
    validate(filePath);
    return { ok: true as const };
  } catch (exc) {
    if (exc instanceof ValidationError) {
      return { ok: false as const, code: exc.code };
    }
    throw exc;
  }
}

function _runSelfTest(): number {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-notepad-'));
  try {
    const clean = path.join(sandbox, 'notepad-clean.md');
    fs.writeFileSync(clean, _CLEAN_FIXTURE, 'utf-8');
    const cleanResult = _safeValidate(clean);
    if (!cleanResult.ok) {
      return 1;
    }

    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ['missing-header', _BAD_MISSING_HEADER, 'missing required header'],
      ['oversized-priority', _BAD_OVERSIZED_PRIORITY, 'Priority Context exceeds'],
      ['untimestamped-working', _BAD_UNTIMESTAMPED_WORKING, 'does not start with an ISO 8601'],
      ['nonmonotonic-working', _BAD_NONMONOTONIC_WORKING, 'not sorted non-decreasing'],
    ];

    for (const [name, fixture] of cases) {
      const bad = path.join(sandbox, `notepad-${name}.md`);
      fs.writeFileSync(bad, fixture, 'utf-8');
      const result = _safeValidate(bad);
      if (result.ok) {
        process.stderr.write(`FAIL: self-test ${name}: validator did not detect the problem\n`);
        return 1;
      }
      if (result.code !== 1) {
        process.stderr.write(
          `FAIL: self-test ${name}: expected SystemExit(1), got SystemExit(${result.code})\n`,
        );
        return 1;
      }
      _ok(`self-test detected ${name}`);
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  let templateExists = false;
  try {
    templateExists = fs.statSync(TEMPLATE_PATH).isFile();
  } catch {
    templateExists = false;
  }
  if (templateExists) {
    const result = _safeValidate(TEMPLATE_PATH);
    if (!result.ok) {
      return 1;
    }
    _ok(`shipped template passes: ${path.relative(ROOT, TEMPLATE_PATH)}`);
  } else {
    process.stderr.write(`FAIL: shipped template missing: ${TEMPLATE_PATH}\n`);
    return 1;
  }

  process.stdout.write('VALIDATE_NOTEPAD_FORMAT_SELF_TEST_OK\n');
  return 0;
}

function main(argv?: string[]): number {
  const args = argv ?? process.argv.slice(2);
  if (args.includes('--self-test')) {
    return _runSelfTest();
  }
  const target = args.length > 0 ? args[0] : TEMPLATE_PATH;
  const result = _safeValidate(target);
  if (!result.ok) {
    return result.code;
  }
  process.stdout.write('VALIDATE_NOTEPAD_FORMAT_OK\n');
  return 0;
}

process.exit(main());
