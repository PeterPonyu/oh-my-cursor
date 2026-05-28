import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..', '..');

function runHook(script: string, payload: unknown): { status: number | null; json: any; stdout: string; stderr: string } {
  const result = spawnSync('node', ['--experimental-strip-types', path.join(ROOT, script)], {
    cwd: ROOT,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
  });
  const stdout = result.stdout.trim();
  return {
    status: result.status,
    json: stdout ? JSON.parse(stdout) : null,
    stdout,
    stderr: result.stderr,
  };
}

test('shell-guard allows safe commands', () => {
  const result = runHook('hooks/shell-guard.ts', { command: 'git status --short' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.permission, 'allow');
  assert.equal(result.json.status, 'pass');
});

test('shell-guard warns on risky destructive commands without denying safe review', () => {
  const result = runHook('hooks/shell-guard.ts', { command: 'git reset --hard HEAD' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.permission, 'allow');
  assert.equal(result.json.status, 'warning');
  assert.deepEqual(result.json.warnings, ['git-reset-hard']);
});

test('shell-guard asks before commands that can corrupt workflow-state', () => {
  const result = runHook('hooks/shell-guard.ts', { command: 'rm .cursor/state/workflow-state.json' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.permission, 'ask');
  assert.equal(result.json.status, 'severe');
  assert.deepEqual(result.json.severe, ['destroy-state-file']);
});

test('tool-guard asks before direct workflow-state edits', () => {
  const result = runHook('hooks/tool-guard.ts', {
    tool_name: 'Edit',
    file_path: '.cursor/state/workflow-state.json',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.permission, 'ask');
  assert.equal(result.json.status, 'ask');
});

test('claim-guard detects conflict markers in edited files', () => {
  const fixture = path.join(ROOT, 'docs', '__claim_guard_conflict_fixture.md');
  fs.writeFileSync(fixture, 'heading\n<<<<<<< ours\nbody\n>>>>>>> theirs\n', 'utf-8');
  try {
    const result = runHook('hooks/claim-guard.ts', { path: fixture });
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.json.status, 'severe');
    assert.ok(result.json.issues.some((issue: any) => issue.rule === 'safety-conflict-marker'));
  } finally {
    fs.rmSync(fixture, { force: true });
  }
});

test('claim-guard detects unsupported repo-owned custom mode overclaims', () => {
  const fixture = path.join(ROOT, 'docs', '__claim_guard_overclaim_fixture.md');
  fs.writeFileSync(fixture, 'This feature is a repo-file custom mode and repo-owned by this repository.\n', 'utf-8');
  try {
    const result = runHook('hooks/claim-guard.ts', { path: fixture });
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.json.status, 'severe');
    assert.ok(result.json.issues.some((issue: any) => issue.rule === 'repo-file-modes'));
  } finally {
    fs.rmSync(fixture, { force: true });
  }
});

test('claim-guard skips large safety scans to avoid blocking edit flow', () => {
  const fixture = path.join(ROOT, 'docs', '__claim_guard_large_fixture.md');
  fs.writeFileSync(fixture, `${'large generated line\n'.repeat(20000)}<<<<<<< ours\n`, 'utf-8');
  try {
    const result = runHook('hooks/claim-guard.ts', { path: fixture });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.status, 'pass');
    assert.equal(result.json.severe_count, 0);
  } finally {
    fs.rmSync(fixture, { force: true });
  }
});

test('stop-gate requests one follow-up on first error stop', () => {
  const result = runHook('hooks/stop-gate.ts', { status: 'error', loop_count: 0 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.status, 'followup-requested');
  assert.equal(result.json.continue, true);
});

test('stop-gate passes after the follow-up loop limit', () => {
  const result = runHook('hooks/stop-gate.ts', { status: 'error', loop_count: 1 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.status, 'pass');
  assert.equal(result.json.continue, false);
});
