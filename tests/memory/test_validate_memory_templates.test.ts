// node:test coverage for scripts/validate-memory-templates.ts.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const SCRIPT = path.resolve(path.dirname(currentFile), '..', '..', 'scripts', 'validate-memory-templates.ts');

test('meta self-test passes', () => {
  const result = spawnSync(
    'node',
    ['--experimental-strip-types', SCRIPT, '--self-test'],
    { encoding: 'utf-8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('VALIDATE_MEMORY_TEMPLATES_SELF_TEST_OK'));
});

test('meta run passes', () => {
  const result = spawnSync(
    'node',
    ['--experimental-strip-types', SCRIPT],
    { encoding: 'utf-8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('VALIDATE_MEMORY_TEMPLATES_OK'));
});
