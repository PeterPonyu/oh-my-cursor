// node:test port of test_rules_install_parity.py.
//
// Smoke-wraps scripts/validate-rules-install-parity.sh so the parity
// check runs alongside the rest of the memory test suite.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'validate-rules-install-parity.sh');

function rsyncAvailable(): boolean {
  const result = spawnSync('rsync', ['--version'], { encoding: 'utf-8' });
  return result.status === 0;
}

test('rules install parity', { skip: !rsyncAvailable() && 'rsync not installed' }, () => {
  const result = spawnSync('bash', [SCRIPT], { encoding: 'utf-8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(
    result.stdout.includes('VALIDATE_RULES_INSTALL_PARITY_OK'),
    `expected VALIDATE_RULES_INSTALL_PARITY_OK in stdout; got:\n${result.stdout}`,
  );
});
