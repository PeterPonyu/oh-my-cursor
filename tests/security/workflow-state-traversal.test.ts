/**
 * Security regression tests for:
 *   #32 - task_id path traversal in workflow-state archive
 *   #33 - shell-string execution rejection in run-autopilot
 *
 * Uses node:test (node --experimental-strip-types --test).
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..', '..');

// ---------------------------------------------------------------------------
// #32 — _sanitizeTaskId / _archiveSession path traversal
// ---------------------------------------------------------------------------

// Import the internal helpers by importing the api module. Because
// _sanitizeTaskId is not exported, we exercise it through initState +
// setState (which calls _archiveSession when phase transitions to 'done').

import { initState, setState } from '../../src/oh_my_cursor/workflow_state/api.ts';
import { _parseArgv } from '../../scripts/run-autopilot.ts';

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wf-traversal-test-'));
}

test('#32 traversal: ../../../etc/passwd task_id is sanitized and archive stays in sessions dir', () => {
  const tmpDir = makeTmp();
  try {
    const stateFile = path.join(tmpDir, 'workflow-state.json');
    const maliciousId = '../../../tmp/omc-traversal-poc';

    // Initialize with the traversal task_id
    initState(stateFile, { task_id: maliciousId, phase: 'execute', status: 'in_progress' });

    // Advance to done — this triggers _archiveSession
    setState(stateFile, { phase: 'done', status: 'passed', note: 'traversal test' });

    // The sessions directory must exist
    const sessionsDir = path.join(path.dirname(stateFile), 'sessions');
    assert.ok(fs.existsSync(sessionsDir), 'sessions dir should be created');

    // All archived files must be inside sessionsDir
    const files = fs.readdirSync(sessionsDir);
    assert.ok(files.length > 0, 'at least one archive file should exist');
    for (const f of files) {
      const resolved = path.resolve(sessionsDir, f);
      assert.ok(
        resolved.startsWith(path.resolve(sessionsDir) + path.sep),
        `archive file ${f} escaped sessions dir: ${resolved}`
      );
    }

    // The malicious path /tmp/omc-traversal-poc*.json must NOT exist
    const escaped = path.join('/tmp', 'omc-traversal-poc');
    const escapedFiles = fs.readdirSync('/tmp').filter(f => f.startsWith('omc-traversal-poc'));
    assert.strictEqual(escapedFiles.length, 0, `path traversal succeeded: found ${escapedFiles.join(', ')} in /tmp`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('#32 traversal: task_id with forward slashes is sanitized', () => {
  const tmpDir = makeTmp();
  try {
    const stateFile = path.join(tmpDir, 'workflow-state.json');
    const slashId = 'foo/bar/baz';

    initState(stateFile, { task_id: slashId, phase: 'execute', status: 'in_progress' });
    setState(stateFile, { phase: 'done', status: 'passed' });

    const sessionsDir = path.join(path.dirname(stateFile), 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      for (const f of files) {
        const resolved = path.resolve(sessionsDir, f);
        assert.ok(
          resolved.startsWith(path.resolve(sessionsDir) + path.sep),
          `archive file escaped sessions dir: ${resolved}`
        );
        // Filename must not contain directory separators (slashes became underscores)
        assert.ok(!f.includes('/'), `archive filename contains slash: ${f}`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('#32 traversal: safe task_id passes through unchanged', () => {
  const tmpDir = makeTmp();
  try {
    const stateFile = path.join(tmpDir, 'workflow-state.json');
    const safeId = 'task-001_my.task';

    initState(stateFile, { task_id: safeId, phase: 'execute', status: 'in_progress' });
    setState(stateFile, { phase: 'done', status: 'passed' });

    const sessionsDir = path.join(path.dirname(stateFile), 'sessions');
    assert.ok(fs.existsSync(sessionsDir), 'sessions dir should be created');
    const files = fs.readdirSync(sessionsDir);
    assert.ok(files.length > 0, 'archive file should exist');
    // The safe task_id should appear verbatim in the filename
    assert.ok(
      files.some(f => f.includes(safeId)),
      `expected safe task_id "${safeId}" in archive filename, got: ${files.join(', ')}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// #33 — _parseArgv shell-operator rejection (imported from run-autopilot.ts)
// ---------------------------------------------------------------------------

test('#33 shell-exec: pipe operator is rejected', () => {
  assert.strictEqual(_parseArgv('echo hello | cat'), null);
});

test('#33 shell-exec: semicolon is rejected', () => {
  assert.strictEqual(_parseArgv('echo hello; rm -rf /'), null);
});

test('#33 shell-exec: ampersand is rejected', () => {
  assert.strictEqual(_parseArgv('sleep 10 & echo pwned'), null);
});

test('#33 shell-exec: backtick is rejected', () => {
  assert.strictEqual(_parseArgv('echo `id`'), null);
});

test('#33 shell-exec: dollar-paren subshell is rejected', () => {
  assert.strictEqual(_parseArgv('echo $(id)'), null);
});

test('#33 shell-exec: redirect operator is rejected', () => {
  assert.strictEqual(_parseArgv('printf poc > /tmp/test.txt'), null);
});

test('#33 shell-exec: safe single-token command parses correctly', () => {
  const result = _parseArgv('node --check scripts/foo.ts');
  assert.deepStrictEqual(result, ['node', '--check', 'scripts/foo.ts']);
});

test('#33 shell-exec: quoted arguments with spaces parse correctly', () => {
  const result = _parseArgv('node --experimental-strip-types "scripts/my script.ts"');
  assert.deepStrictEqual(result, ['node', '--experimental-strip-types', 'scripts/my script.ts']);
});

test('#33 shell-exec: empty string returns null', () => {
  assert.strictEqual(_parseArgv(''), null);
  assert.strictEqual(_parseArgv('   '), null);
});
