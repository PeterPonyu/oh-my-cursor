/**
 * Unit tests for mcp/cursor-state-bridge core modules.
 * Covers: jail.ts, auth.ts, state_io.ts, memory_io.ts
 *
 * Run with:
 *   node --experimental-strip-types --test mcp/cursor-state-bridge/tests/bridge.test.ts
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const BRIDGE_ROOT = path.resolve(path.dirname(currentFile), '..');

import { JailError, resolveJailed, jailRoots } from '../jail.ts';
import { authenticate, expectedToken, ENV_TOKEN_NAME } from '../auth.ts';
import * as stateIo from '../state_io.ts';
import * as memoryIo from '../memory_io.ts';

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
}

// jail.ts

test('jail: path inside .cursor/state is allowed', () => {
  const tmpDir = makeTmp();
  try {
    const stateDir = path.join(tmpDir, '.cursor', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const target = path.join(stateDir, 'workflow-state.json');
    fs.writeFileSync(target, '{}');
    const result = resolveJailed(tmpDir, target);
    assert.ok(result.startsWith(stateDir));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('jail: path escaping workspace throws JailError', () => {
  const tmpDir = makeTmp();
  try {
    const escapePath = path.join(tmpDir, '.cursor', 'state', '..', '..', '..', 'etc', 'passwd');
    assert.throws(
      () => resolveJailed(tmpDir, escapePath),
      (err: any) => err instanceof JailError
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('jail: path inside docs/plans is allowed', () => {
  const tmpDir = makeTmp();
  try {
    const plansDir = path.join(tmpDir, 'docs', 'plans', 'task-001');
    fs.mkdirSync(plansDir, { recursive: true });
    const target = path.join(plansDir, 'workflow-state.json');
    fs.writeFileSync(target, '{}');
    const result = resolveJailed(tmpDir, target);
    assert.ok(result.startsWith(path.join(tmpDir, 'docs', 'plans')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// auth.ts

test('auth: no env var set — authenticate always returns true', () => {
  const prev = process.env[ENV_TOKEN_NAME];
  delete process.env[ENV_TOKEN_NAME];
  try {
    assert.strictEqual(authenticate({}), true);
    assert.strictEqual(authenticate({ token: 'anything' }), true);
    assert.strictEqual(authenticate(null), true);
  } finally {
    if (prev !== undefined) process.env[ENV_TOKEN_NAME] = prev;
  }
});

test('auth: token set — matching token passes', () => {
  const prev = process.env[ENV_TOKEN_NAME];
  process.env[ENV_TOKEN_NAME] = 'secret-token';
  try {
    assert.strictEqual(authenticate({ token: 'secret-token' }), true);
  } finally {
    if (prev !== undefined) process.env[ENV_TOKEN_NAME] = prev;
    else delete process.env[ENV_TOKEN_NAME];
  }
});

test('auth: token set — wrong token rejected', () => {
  const prev = process.env[ENV_TOKEN_NAME];
  process.env[ENV_TOKEN_NAME] = 'secret-token';
  try {
    assert.strictEqual(authenticate({ token: 'wrong' }), false);
    assert.strictEqual(authenticate({}), false);
    assert.strictEqual(authenticate(null), false);
  } finally {
    if (prev !== undefined) process.env[ENV_TOKEN_NAME] = prev;
    else delete process.env[ENV_TOKEN_NAME];
  }
});

// state_io.ts — happy-path round-trip state_init -> state_read

test('state_io: state_init then state_read returns the initialised state', () => {
  const tmpDir = makeTmp();
  try {
    const stateDir = path.join(tmpDir, '.cursor', 'state');
    fs.mkdirSync(stateDir, { recursive: true });

    // scope_per_task: false writes to .cursor/state/workflow-state.json
    stateIo.state_init(tmpDir, { task_id: 'test-task', title: 'Test', phase: 'plan', status: 'in_progress', scope_per_task: false });
    const result = stateIo.state_read(tmpDir, {});

    assert.ok(result && result.content && result.content.length > 0);
    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    assert.strictEqual(parsed.task_id, 'test-task');
    assert.strictEqual(parsed.phase, 'plan');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('state_io: state_read rejects workspace override outside configured workspace', () => {
  const tmpDir = makeTmp();
  const outsideDir = makeTmp();
  try {
    const outsideStateDir = path.join(outsideDir, '.cursor', 'state');
    fs.mkdirSync(outsideStateDir, { recursive: true });
    fs.writeFileSync(
      path.join(outsideStateDir, 'workflow-state.json'),
      JSON.stringify({ task_id: 'outside-secret' }),
      'utf-8'
    );

    assert.throws(
      () => stateIo.state_read(tmpDir, { workspace: outsideDir }),
      (err: any) => err instanceof JailError
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test('state_io: state_read rejects traversal in workspace override before normalization', () => {
  const tmpDir = makeTmp();
  try {
    assert.throws(
      () => stateIo.state_read(tmpDir, { workspace: 'safe/../safe' }),
      (err: any) => err instanceof JailError
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('state_io: state_read allows workspace override inside configured workspace', () => {
  const tmpDir = makeTmp();
  try {
    const subWorkspace = path.join(tmpDir, 'nested');
    const stateDir = path.join(subWorkspace, '.cursor', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, 'workflow-state.json'),
      JSON.stringify({ task_id: 'inside-subworkspace' }),
      'utf-8'
    );

    const result = stateIo.state_read(tmpDir, { workspace: subWorkspace });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.task_id, 'inside-subworkspace');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// memory_io.ts — memory_notepad_append_working happy path + bad path throws

const NOTEPAD_CONTENT =
  '# notepad\n\n' +
  '<!-- OMCS:NOTEPAD:PRIORITY -->\n' +
  '<!-- /OMCS:NOTEPAD:PRIORITY -->\n\n' +
  '<!-- OMCS:NOTEPAD:WORKING -->\n' +
  '<!-- /OMCS:NOTEPAD:WORKING -->\n\n' +
  '<!-- OMCS:NOTEPAD:MANUAL -->\n' +
  '<!-- /OMCS:NOTEPAD:MANUAL -->\n';

test('memory_io: append_working adds entry to notepad.md', () => {
  const tmpDir = makeTmp();
  try {
    const omcsDir = path.join(tmpDir, '.omcs');
    fs.mkdirSync(omcsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'notepad.md'), NOTEPAD_CONTENT, 'utf-8');

    const result = memoryIo.memory_notepad_append_working(tmpDir, { note: 'test entry' });
    assert.ok(result && result.content && result.content.length > 0);

    const updated = fs.readFileSync(path.join(tmpDir, 'notepad.md'), 'utf-8');
    assert.ok(updated.includes('test entry'), 'notepad should contain appended note');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('memory_io: path traversal in memory path throws JailError', () => {
  const tmpDir = makeTmp();
  try {
    assert.throws(
      () => memoryIo.memory_notepad_append_working(tmpDir, { note: 'x', path: '../../../etc/passwd' }),
      (err: any) => err instanceof JailError || err instanceof Error
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
