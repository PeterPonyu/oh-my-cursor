/**
 * node:test coverage for scripts/validate-notepad-format.ts.
 *
 * We invoke the script as a subprocess so the test exercises the same
 * entry path a maintainer or CI step would use.
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(currentFile), '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-notepad-format.ts');
const TEMPLATE = path.join(REPO_ROOT, 'docs', 'templates', 'notepad.md');

const CLEAN =
  '# notepad\n\n' +
  '## Priority Context\n\n' +
  '<!-- OMCS:NOTEPAD:PRIORITY -->\n' +
  'Short and sweet.\n' +
  '<!-- /OMCS:NOTEPAD:PRIORITY -->\n\n' +
  '## Working Memory\n\n' +
  '<!-- OMCS:NOTEPAD:WORKING -->\n' +
  '2026-05-20T15:00:00Z first\n' +
  '2026-05-20T16:00:00Z second\n' +
  '<!-- /OMCS:NOTEPAD:WORKING -->\n\n' +
  '## MANUAL\n\n' +
  '<!-- OMCS:NOTEPAD:MANUAL -->\n' +
  'Hand-curated invariant.\n' +
  '<!-- /OMCS:NOTEPAD:MANUAL -->\n';

function run(arg: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', SCRIPT, arg],
    { encoding: 'utf-8' },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'notepad-test-'));
}

function writeAndRun(content: string): { status: number | null; stdout: string; stderr: string; cleanup: () => void } {
  const dir = mkTempDir();
  const nb = path.join(dir, 'notepad.md');
  fs.writeFileSync(nb, content, 'utf-8');
  const result = run(nb);
  return {
    ...result,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

test('self_test_passes', () => {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', SCRIPT, '--self-test'],
    { encoding: 'utf-8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    (result.stdout ?? '').includes('VALIDATE_NOTEPAD_FORMAT_SELF_TEST_OK'),
    `expected self-test success token in stdout; got: ${result.stdout}`,
  );
});

test('shipped_template_passes', () => {
  const result = run(TEMPLATE);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    result.stdout.includes('VALIDATE_NOTEPAD_FORMAT_OK'),
    `expected success token in stdout; got: ${result.stdout}`,
  );
});

test('clean_fixture_passes', () => {
  const r = writeAndRun(CLEAN);
  try {
    assert.equal(r.status, 0, r.stderr);
  } finally {
    r.cleanup();
  }
});

const MARKER_CASES: ReadonlyArray<{ replacement: string; expectedSubstr: string }> = [
  { replacement: '## Priority Context', expectedSubstr: 'missing required header' },
  { replacement: '<!-- OMCS:NOTEPAD:PRIORITY -->', expectedSubstr: 'missing start marker' },
  { replacement: '<!-- /OMCS:NOTEPAD:PRIORITY -->', expectedSubstr: 'missing end marker' },
];

for (const { replacement, expectedSubstr } of MARKER_CASES) {
  test(`missing_markers_fail: ${replacement}`, () => {
    const r = writeAndRun(CLEAN.replace(replacement, ''));
    try {
      assert.equal(r.status, 1);
      assert.ok(
        r.stderr.includes(expectedSubstr),
        `expected stderr to include '${expectedSubstr}'; got: ${r.stderr}`,
      );
    } finally {
      r.cleanup();
    }
  });
}

test('oversized_priority_fails', () => {
  const r = writeAndRun(CLEAN.replace('Short and sweet.', 'x'.repeat(600)));
  try {
    assert.equal(r.status, 1);
    assert.ok(
      r.stderr.includes('Priority Context exceeds'),
      `expected oversized priority failure; got: ${r.stderr}`,
    );
  } finally {
    r.cleanup();
  }
});

test('nonmonotonic_working_fails', () => {
  const swapped = CLEAN.replace(
    '2026-05-20T15:00:00Z first\n2026-05-20T16:00:00Z second',
    '2026-05-20T16:00:00Z second\n2026-05-20T15:00:00Z first',
  );
  const r = writeAndRun(swapped);
  try {
    assert.equal(r.status, 1);
    assert.ok(
      r.stderr.includes('not sorted non-decreasing'),
      `expected non-monotonic failure; got: ${r.stderr}`,
    );
  } finally {
    r.cleanup();
  }
});

test('untimestamped_working_fails', () => {
  const r = writeAndRun(
    CLEAN.replace('2026-05-20T15:00:00Z first', 'first (no timestamp)'),
  );
  try {
    assert.equal(r.status, 1);
    assert.ok(
      r.stderr.includes('does not start with an ISO 8601'),
      `expected untimestamped failure; got: ${r.stderr}`,
    );
  } finally {
    r.cleanup();
  }
});
