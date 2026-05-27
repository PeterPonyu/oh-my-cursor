/**
 * node:test coverage for scripts/validate-project-memory.ts.
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'validate-project-memory.ts');
const TEMPLATE = path.join(ROOT, 'docs', 'templates', 'project-memory.json');

const CLEAN = {
  version: 1,
  task: '',
  techStack: { languages: ['python'], frameworks: [], tooling: ['pytest'] },
  build: { install: '', test: 'pytest', lint: '', typecheck: '' },
  conventions: { indent: '4 spaces', filenameCase: 'snake_case', moduleLayout: '' },
  structure: { src: 'src/', tests: 'tests/', docs: 'docs/' },
  userOwned: { customNotes: ['note one'], directives: ['never push to main'] },
  hotPaths: ['scripts/validate-workflow-state.py'],
};

function runScript(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', SCRIPT, ...args],
    { encoding: 'utf-8' },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-project-memory-test-'));
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
}

test('self-test passes', () => {
  const result = runScript('--self-test');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('VALIDATE_PROJECT_MEMORY_SELF_TEST_OK'));
});

test('shipped template passes', () => {
  const result = runScript(TEMPLATE);
  assert.equal(result.status, 0, result.stderr);
});

test('clean fixture passes', () => {
  const tmp = makeTmpDir();
  try {
    const pm = path.join(tmp, 'pm.json');
    writeJson(pm, CLEAN);
    const result = runScript(pm);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('bad version fails', () => {
  const tmp = makeTmpDir();
  try {
    const pm = path.join(tmp, 'pm.json');
    const bad = JSON.parse(JSON.stringify(CLEAN));
    bad.version = 2;
    writeJson(pm, bad);
    const result = runScript(pm);
    assert.equal(result.status, 1);
    assert.ok(
      result.stderr.includes('version must be the integer 1'),
      `expected version message in stderr, got: ${result.stderr}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('missing userOwned fails', () => {
  const tmp = makeTmpDir();
  try {
    const pm = path.join(tmp, 'pm.json');
    const bad = JSON.parse(JSON.stringify(CLEAN));
    delete bad.userOwned;
    writeJson(pm, bad);
    const result = runScript(pm);
    assert.equal(result.status, 1);
    assert.ok(
      result.stderr.includes('missing required key: userOwned'),
      `expected missing key message in stderr, got: ${result.stderr}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('userOwned array shape is enforced', () => {
  const tmp = makeTmpDir();
  try {
    const pm = path.join(tmp, 'pm.json');
    const bad = JSON.parse(JSON.stringify(CLEAN));
    bad.userOwned.directives = 'never push';
    writeJson(pm, bad);
    const result = runScript(pm);
    assert.equal(result.status, 1);
    assert.ok(
      result.stderr.includes('userOwned.directives must be an array'),
      `expected array shape message in stderr, got: ${result.stderr}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('extra top-level key fails', () => {
  const tmp = makeTmpDir();
  try {
    const pm = path.join(tmp, 'pm.json');
    const bad = JSON.parse(JSON.stringify(CLEAN));
    bad.surprise = 'nope';
    writeJson(pm, bad);
    const result = runScript(pm);
    assert.equal(result.status, 1);
    assert.ok(
      result.stderr.includes('unsupported fields'),
      `expected unsupported fields message in stderr, got: ${result.stderr}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
