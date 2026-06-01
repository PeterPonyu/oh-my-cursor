/**
 * CURSOR-5 — structured-output serialization tests for the session hooks
 * hooks/session-bootstrap.ts and hooks/session-summary.ts.
 *
 * Both hooks read a workflow-state document, summarize it, and print a single
 * JSON line on stdout. These tests exercise the serialization edge cases:
 *   - pending/failed criteria truncation to the first 10
 *   - empty acceptance_criteria array
 *   - missing / null phase and status (null coalescing in the emitted JSON)
 *   - large acceptance_criteria arrays
 *   - a full read -> summarize -> output round-trip
 * Every case asserts the hook emits one line of valid JSON.
 *
 * Uses node:test (node --experimental-strip-types --test) and drives the hooks
 * over stdin, passing the state file path via the `workflow_state` payload field
 * (resolveStatePath honors it), matching tests/hooks/hook-behavior.test.ts style.
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

const BOOTSTRAP = 'hooks/session-bootstrap.ts';
const SUMMARY = 'hooks/session-summary.ts';

function runHook(script: string, payload: unknown): { status: number | null; json: any; stdout: string; stderr: string } {
  const result = spawnSync('node', ['--experimental-strip-types', path.join(ROOT, script)], {
    cwd: ROOT,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
  });
  const stdout = result.stdout.trim();
  // Hooks must emit exactly one JSON object line; JSON.parse throwing fails the test.
  return { status: result.status, json: stdout ? JSON.parse(stdout) : null, stdout, stderr: result.stderr };
}

function writeStateFile(doc: unknown): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-serialization-'));
  const file = path.join(dir, 'workflow-state.json');
  fs.writeFileSync(file, JSON.stringify(doc), 'utf-8');
  return { dir, file };
}

function makeCriteria(count: number, status: string): Array<{ id: string; criterion: string; status: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: `AC-${i + 1}`,
    criterion: `criterion ${i + 1}`,
    status,
  }));
}

function assertValidJsonLine(res: { status: number | null; stdout: string; json: any; stderr: string }): void {
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout.split('\n').length, 1, `expected a single JSON line, got: ${res.stdout}`);
  assert.equal(typeof res.json, 'object');
  assert.notEqual(res.json, null);
}

// --- truncation to first 10 ---

test('session-bootstrap truncates pending criteria to the first 10', () => {
  const { dir, file } = writeStateFile({
    task_id: 't', phase: 'execute', status: 'in_progress',
    acceptance_criteria: makeCriteria(25, 'pending'),
  });
  try {
    const res = runHook(BOOTSTRAP, { workflow_state: file });
    assertValidJsonLine(res);
    assert.equal(res.json.workflow_state.pending_criteria.length, 10);
    assert.deepEqual(res.json.workflow_state.pending_criteria[0], 'AC-1');
    assert.deepEqual(res.json.workflow_state.pending_criteria[9], 'AC-10');
    assert.equal(res.json.workflow_state.failed_criteria.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('session-summary truncates failed criteria to the first 10', () => {
  const { dir, file } = writeStateFile({
    task_id: 't', phase: 'verify', status: 'failed',
    acceptance_criteria: makeCriteria(30, 'failed'),
  });
  try {
    const res = runHook(SUMMARY, { workflow_state: file });
    assertValidJsonLine(res);
    assert.equal(res.json.workflow_state.failed_criteria.length, 10);
    assert.deepEqual(res.json.workflow_state.failed_criteria[0], 'AC-1');
    assert.deepEqual(res.json.workflow_state.failed_criteria[9], 'AC-10');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- empty criteria array ---

test('session-bootstrap handles an empty acceptance_criteria array', () => {
  const { dir, file } = writeStateFile({
    task_id: 't', phase: 'plan', status: 'pending', acceptance_criteria: [],
  });
  try {
    const res = runHook(BOOTSTRAP, { workflow_state: file });
    assertValidJsonLine(res);
    assert.equal(res.json.workflow_state.loaded, true);
    assert.deepEqual(res.json.workflow_state.pending_criteria, []);
    assert.deepEqual(res.json.workflow_state.failed_criteria, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('session-summary handles an empty acceptance_criteria array', () => {
  const { dir, file } = writeStateFile({
    task_id: 't', phase: 'done', status: 'passed', acceptance_criteria: [],
  });
  try {
    const res = runHook(SUMMARY, { workflow_state: file });
    assertValidJsonLine(res);
    assert.deepEqual(res.json.workflow_state.pending_criteria, []);
    assert.deepEqual(res.json.workflow_state.failed_criteria, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- missing / null phase and status (null coalescing) ---

test('session-bootstrap coalesces missing phase/status to null in JSON output', () => {
  const { dir, file } = writeStateFile({
    task_id: 't', acceptance_criteria: [],
  });
  try {
    const res = runHook(BOOTSTRAP, { workflow_state: file });
    assertValidJsonLine(res);
    assert.equal(res.json.workflow_state.loaded, true);
    assert.equal(res.json.workflow_state.phase, null);
    assert.equal(res.json.workflow_state.status, null);
    assert.equal(res.json.workflow_state.current_role, null);
    // additional_context still renders a '?' placeholder for the absent phase/status.
    assert.match(res.json.additional_context, /phase=\?/);
    assert.match(res.json.additional_context, /status=\?/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('session-summary coalesces explicit null phase/status to null in JSON output', () => {
  const { dir, file } = writeStateFile({
    task_id: 't', phase: null, status: null, acceptance_criteria: [],
  });
  try {
    const res = runHook(SUMMARY, { workflow_state: file });
    assertValidJsonLine(res);
    assert.equal(res.json.workflow_state.phase, null);
    assert.equal(res.json.workflow_state.status, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- large arrays ---

test('session-bootstrap stays valid JSON and capped on a large mixed criteria array', () => {
  const criteria = [
    ...makeCriteria(500, 'pending'),
    ...makeCriteria(500, 'failed').map((c, i) => ({ ...c, id: `FAIL-${i + 1}` })),
  ];
  const { dir, file } = writeStateFile({
    task_id: 't', phase: 'execute', status: 'in_progress', acceptance_criteria: criteria,
  });
  try {
    const res = runHook(BOOTSTRAP, { workflow_state: file });
    assertValidJsonLine(res);
    assert.equal(res.json.workflow_state.pending_criteria.length, 10);
    assert.equal(res.json.workflow_state.failed_criteria.length, 10);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- read -> summarize -> output round-trip ---

test('round-trip: bootstrap reads, summarizes, and re-emits the same state path and fields', () => {
  const doc = {
    task_id: 'round-trip',
    phase: 'review',
    status: 'in_progress',
    current_role: 'verifier',
    next_action: 'finish review',
    acceptance_criteria: [
      { id: 'AC-1', criterion: 'a', status: 'pending' },
      { id: 'AC-2', criterion: 'b', status: 'failed' },
      { id: 'AC-3', criterion: 'c', status: 'passed' },
      { id: 'AC-4', criterion: 'd', status: 'skipped' },
    ],
  };
  const { dir, file } = writeStateFile(doc);
  try {
    const res = runHook(BOOTSTRAP, { workflow_state: file });
    assertValidJsonLine(res);
    const ws = res.json.workflow_state;
    assert.equal(ws.path, file);
    assert.equal(ws.loaded, true);
    assert.equal(ws.phase, 'review');
    assert.equal(ws.status, 'in_progress');
    assert.equal(ws.current_role, 'verifier');
    // Only pending criteria land in pending; only failed land in failed.
    assert.deepEqual(ws.pending_criteria, ['AC-1']);
    assert.deepEqual(ws.failed_criteria, ['AC-2']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('round-trip: summary reads, summarizes, and re-emits state plus session closure fields', () => {
  const doc = {
    task_id: 'round-trip-summary',
    phase: 'done',
    status: 'passed',
    acceptance_criteria: makeCriteria(2, 'passed'),
  };
  const { dir, file } = writeStateFile(doc);
  try {
    const res = runHook(SUMMARY, {
      workflow_state: file,
      session_id: 'sess-1',
      final_status: 'success',
      duration_ms: 1234,
    });
    assertValidJsonLine(res);
    assert.equal(res.json.session.session_id, 'sess-1');
    assert.equal(res.json.session.final_status, 'success');
    assert.equal(res.json.session.duration_ms, 1234);
    assert.equal(res.json.workflow_state.path, file);
    assert.equal(res.json.workflow_state.phase, 'done');
    assert.equal(res.json.workflow_state.status, 'passed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
