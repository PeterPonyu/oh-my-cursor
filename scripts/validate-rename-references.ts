import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const FIXTURE = path.join(ROOT, 'docs', 'plans', 'mcp-state-bridge-2026-05', 'expected-rename-references.txt');

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(FIXTURE)) {
  fail(`fixture not found: ${path.relative(ROOT, FIXTURE)}`);
}

function normalize(line: string): string {
  const clean = line.startsWith('./') ? line.slice(2) : line;
  return clean.replace(/^([^:]+):\d+:/, '$1::');
}

function main() {
  const fixtureContent = fs.readFileSync(FIXTURE, 'utf-8');
  const fixtureLines = fixtureContent
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => normalize(line))
    .sort();

  let grepText = '';
  try {
    const result = execSync(
      'grep -RIn "workflow-state\\.ts" ' +
      '--include=*.ts ' +
      '--include=*.sh ' +
      '--include=*.md ' +
      '--include=*.mdc ' +
      '--include=*.yaml ' +
      '--exclude-dir=.git ' +
      '--exclude-dir=.omcs ' +
      '--exclude-dir=.omc ' +
      '--exclude-dir=.cursor-worktree ' +
      '--exclude-dir=dist ' +
      '--exclude-dir=benchmark/runs/data ' +
      '--exclude-dir=docs/plans ' +
      '.',
      { cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'] }
    );
    grepText = result.toString('utf-8');
  } catch (err: any) {
    if (err.status === 1) {
      grepText = '';
    } else {
      fail(`grep failed with exit code ${err.status}: ${err.message}`);
    }
  }

  const actualLines = grepText
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => normalize(line))
    .sort();

  if (JSON.stringify(actualLines) === JSON.stringify(fixtureLines)) {
    console.log('RENAME_REFERENCES_OK');
    process.exit(0);
  }

  console.error('FAIL: RENAME_REFERENCES_DRIFT: fixture out of date, regenerate or coordinate the rename');
  console.error(`Expected ${fixtureLines.length} references, got ${actualLines.length} references.`);
  
  // Also print the differences
  const expectedSet = new Set(fixtureLines);
  const actualSet = new Set(actualLines);

  const missing = fixtureLines.filter(x => !actualSet.has(x));
  const extra = actualLines.filter(x => !expectedSet.has(x));

  if (missing.length > 0) {
    console.error('Missing in actual grep:');
    missing.forEach(m => console.error(`  - ${m}`));
  }
  if (extra.length > 0) {
    console.error('Extra in actual grep:');
    extra.forEach(e => console.error(`  + ${e}`));
  }

  process.exit(1);
}

main();
