/**
 * CURSOR-7 — schema-driven validation regression tests for hooks/state-watcher.ts.
 *
 * state-watcher's validateAgainstSchema now derives enum values, required
 * fields, and numeric ranges from .cursor/state/workflow-state.schema.json
 * instead of hardcoding them. These tests prove the schema-derived constraints
 * are actually enforced end-to-end: the hook reads the schema from disk,
 * validates the edited workflow-state document, and reports schema issues.
 *
 * Uses node:test (node --experimental-strip-types --test) and drives the hook
 * over stdin exactly as the Cursor host would, matching tests/hooks/hook-behavior.test.ts.
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
const SCHEMA_PATH = path.join(ROOT, '.cursor', 'state', 'workflow-state.schema.json');

function runStateWatcher(filePath: string): { status: number | null; json: any; stderr: string } {
  const result = spawnSync('node', ['--experimental-strip-types', path.join(ROOT, 'hooks', 'state-watcher.ts')], {
    cwd: ROOT,
    input: JSON.stringify({ tool_name: 'Edit', file_path: filePath }),
    encoding: 'utf-8',
  });
  const stdout = result.stdout.trim();
  return { status: result.status, json: stdout ? JSON.parse(stdout) : null, stderr: result.stderr };
}

function writeState(doc: unknown): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-watcher-schema-'));
  const stateDir = path.join(dir, '.cursor', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const file = path.join(stateDir, 'workflow-state.json');
  fs.writeFileSync(file, JSON.stringify(doc), 'utf-8');
  return { dir, file };
}

const VALID_DOC = {
  task_id: 'schema-test',
  phase: 'execute',
  status: 'in_progress',
  acceptance_criteria: [
    { id: 'AC-1', criterion: 'thing works', status: 'pending' },
  ],
};

test('schema-driven: the workflow-state schema actually declares the constraints we derive', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
  // Top-level enums the hook reads from schema.properties[field].enum.
  assert.ok(Array.isArray(schema.properties.phase.enum) && schema.properties.phase.enum.includes('execute'));
  assert.ok(Array.isArray(schema.properties.status.enum) && schema.properties.status.enum.includes('in_progress'));
  // Acceptance-criteria item required fields + status enum the hook derives.
  const itemSchema = schema.properties.acceptance_criteria.items;
  assert.deepEqual([...itemSchema.required].sort(), ['criterion', 'id', 'status']);
  assert.deepEqual([...itemSchema.properties.status.enum].sort(), ['failed', 'passed', 'pending', 'skipped']);
  // failure.retry_count numeric range the hook derives.
  assert.equal(schema.properties.failure.properties.retry_count.minimum, 0);
  assert.equal(schema.properties.failure.properties.retry_count.maximum, 3);
});

test('schema-driven: a valid document passes with no errors', () => {
  const { dir, file } = writeState(VALID_DOC);
  try {
    const result = runStateWatcher(file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.checked, true);
    assert.equal(result.json.status, 'pass');
    assert.deepEqual(result.json.errors, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema-driven: top-level phase enum (from schema) is enforced', () => {
  const { dir, file } = writeState({ ...VALID_DOC, phase: 'not-a-phase' });
  try {
    const result = runStateWatcher(file);
    assert.equal(result.json.status, 'warning');
    assert.ok(
      result.json.errors.some((e: string) => e.startsWith('field phase must be one of')),
      `expected a phase enum error, got: ${JSON.stringify(result.json.errors)}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema-driven: acceptance_criteria[].status enum is derived from the schema item', () => {
  const doc = {
    ...VALID_DOC,
    acceptance_criteria: [{ id: 'AC-1', criterion: 'x', status: 'bogus-status' }],
  };
  const { dir, file } = writeState(doc);
  try {
    const result = runStateWatcher(file);
    assert.equal(result.json.status, 'warning');
    const err = result.json.errors.find((e: string) => e.includes('acceptance_criteria[0].status'));
    assert.ok(err, `expected an AC status error, got: ${JSON.stringify(result.json.errors)}`);
    // The message lists the schema-derived enum, not an arbitrary hardcoded set.
    assert.ok(err.includes('failed') && err.includes('passed') && err.includes('pending') && err.includes('skipped'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema-driven: acceptance_criteria[] required fields are derived from the schema item', () => {
  const doc = {
    ...VALID_DOC,
    acceptance_criteria: [{ id: 'AC-1' }],
  };
  const { dir, file } = writeState(doc);
  try {
    const result = runStateWatcher(file);
    assert.equal(result.json.status, 'warning');
    assert.ok(result.json.errors.some((e: string) => e.includes('missing required field: criterion')));
    assert.ok(result.json.errors.some((e: string) => e.includes('missing required field: status')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema-driven: failure.retry_count range (from schema minimum/maximum) is enforced', () => {
  const doc = {
    ...VALID_DOC,
    failure: { type: '', message: '', retry_count: 9 },
  };
  const { dir, file } = writeState(doc);
  try {
    const result = runStateWatcher(file);
    assert.equal(result.json.status, 'warning');
    assert.ok(
      result.json.errors.some((e: string) => e === 'failure.retry_count must be between 0 and 3'),
      `expected retry_count range error, got: ${JSON.stringify(result.json.errors)}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema-driven: missing top-level required field (from schema.required) is reported', () => {
  const { task_id, ...withoutTaskId } = VALID_DOC;
  const { dir, file } = writeState(withoutTaskId);
  try {
    const result = runStateWatcher(file);
    assert.equal(result.json.status, 'warning');
    assert.ok(result.json.errors.some((e: string) => e === 'missing required field: task_id'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
