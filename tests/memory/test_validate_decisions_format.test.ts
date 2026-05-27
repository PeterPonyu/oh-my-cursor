// node:test coverage for scripts/validate-decisions-format.ts.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(currentFile), '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-decisions-format.ts');
const TEMPLATE = path.join(REPO_ROOT, 'docs', 'templates', 'decision.md');

const CLEAN =
  '---\n' +
  'id: 20260520-example\n' +
  'title: Example\n' +
  'status: accepted\n' +
  'date: 2026-05-20\n' +
  'supersedes: ""\n' +
  'superseded_by: ""\n' +
  'tags: []\n' +
  '---\n\n' +
  '# 20260520-example\n\n' +
  '## Context\nContext.\n\n' +
  '## Decision\nDecision.\n\n' +
  '## Consequences\nConsequences.\n\n' +
  '## Evidence\nEvidence.\n';

function run(arg: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', ['--experimental-strip-types', SCRIPT, arg], {
    encoding: 'utf-8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-validate-decisions-'));
}

test('self test passes', () => {
  const result = spawnSync('node', ['--experimental-strip-types', SCRIPT, '--self-test'], {
    encoding: 'utf-8',
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(
    (result.stdout ?? '').includes('VALIDATE_DECISIONS_FORMAT_SELF_TEST_OK'),
    `expected self-test ok token in stdout, got: ${result.stdout}`,
  );
});

test('shipped template passes', () => {
  const result = run(TEMPLATE);
  assert.strictEqual(result.status, 0, result.stderr);
});

test('clean fixture passes', () => {
  const tmp = mkTmpDir();
  try {
    const d = path.join(tmp, '20260520-example.md');
    fs.writeFileSync(d, CLEAN, 'utf-8');
    const result = run(d);
    assert.strictEqual(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('bad filename fails', () => {
  const tmp = mkTmpDir();
  try {
    const d = path.join(tmp, 'no-date-prefix.md');
    fs.writeFileSync(d, CLEAN, 'utf-8');
    const result = run(d);
    assert.strictEqual(result.status, 1);
    assert.ok(
      result.stderr.includes('filename must be YYYYMMDD'),
      `expected stderr to mention 'filename must be YYYYMMDD', got: ${result.stderr}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('id mismatch fails', () => {
  const tmp = mkTmpDir();
  try {
    const d = path.join(tmp, '20260520-other.md');
    fs.writeFileSync(d, CLEAN, 'utf-8');
    const result = run(d);
    assert.strictEqual(result.status, 1);
    assert.ok(
      result.stderr.includes('does not match filename id'),
      `expected stderr to mention 'does not match filename id', got: ${result.stderr}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('bad status fails', () => {
  const tmp = mkTmpDir();
  try {
    const d = path.join(tmp, '20260520-example.md');
    fs.writeFileSync(d, CLEAN.replace('status: accepted', 'status: maybe'), 'utf-8');
    const result = run(d);
    assert.strictEqual(result.status, 1);
    assert.ok(
      result.stderr.includes("status='maybe'") || result.stderr.includes('status="maybe"'),
      `expected stderr to mention status='maybe', got: ${result.stderr}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('superseded requires superseded_by', () => {
  const tmp = mkTmpDir();
  try {
    const d = path.join(tmp, '20260520-example.md');
    fs.writeFileSync(d, CLEAN.replace('status: accepted', 'status: superseded'), 'utf-8');
    const result = run(d);
    assert.strictEqual(result.status, 1);
    assert.ok(
      result.stderr.includes('superseded_by is empty'),
      `expected stderr to mention 'superseded_by is empty', got: ${result.stderr}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('missing heading fails', () => {
  const tmp = mkTmpDir();
  try {
    const d = path.join(tmp, '20260520-example.md');
    fs.writeFileSync(d, CLEAN.replace('## Evidence', '## Other'), 'utf-8');
    const result = run(d);
    assert.strictEqual(result.status, 1);
    assert.ok(
      result.stderr.includes('missing required heading: ## Evidence'),
      `expected stderr to mention missing Evidence heading, got: ${result.stderr}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('directory mode validates all', () => {
  const tmp = mkTmpDir();
  try {
    const decisions = path.join(tmp, 'decisions');
    fs.mkdirSync(decisions);
    fs.writeFileSync(
      path.join(decisions, '20260520-a.md'),
      CLEAN.replace('20260520-example', '20260520-a'),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(decisions, '20260521-b.md'),
      CLEAN
        .replace('20260520-example', '20260521-b')
        .replace('2026-05-20', '2026-05-21'),
      'utf-8',
    );
    const result = run(decisions);
    assert.strictEqual(result.status, 0);
    assert.ok(
      result.stdout.includes('validated 2 decision file(s)'),
      `expected stdout to mention 'validated 2 decision file(s)', got: ${result.stdout}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
