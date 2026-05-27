#!/usr/bin/env node
// Validate that every shipped memory template passes its own validator.
//
// Usage:
//   node --experimental-strip-types scripts/validate-memory-templates.ts
//   node --experimental-strip-types scripts/validate-memory-templates.ts --self-test
//
// This is a thin meta-validator: it walks docs/templates/, picks the right
// per-surface validator for each file, and exits non-zero if any template
// fails. It exists so a single ``scripts/verify-backbone.sh`` step can
// assert "all memory templates are shippable" without callers needing to
// remember every per-surface validator name.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const TEMPLATES_DIR = path.join(ROOT, 'docs', 'templates');

const TEMPLATE_MAP: Record<string, string> = {
  'notepad.md': path.join(ROOT, 'scripts', 'validate-notepad-format.ts'),
  'project-memory.json': path.join(ROOT, 'scripts', 'validate-project-memory.ts'),
  'decision.md': path.join(ROOT, 'scripts', 'validate-decisions-format.ts'),
};

// Wiki templates: there is no single "wiki" file, only three pieces; the
// wiki structure validator self-tests them collectively.
const WIKI_TEMPLATE_FILES = [
  'wiki-index.md',
  'wiki-page.md',
  'wiki-log.md',
] as const;

function relToRoot(p: string): string {
  return path.relative(ROOT, p);
}

function fail(message: string): never {
  process.stderr.write(`FAIL: ${message}\n`);
  process.exit(1);
}

function ok(message: string): void {
  process.stdout.write(`ok: ${message}\n`);
}

function runTsValidator(script: string, target: string): void {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', script, target],
    { encoding: 'utf-8', cwd: ROOT },
  );
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`${path.basename(script)} rejected ${relToRoot(target)}`);
  }
  ok(`${path.basename(script)} accepted ${relToRoot(target)}`);
}

function run(): number {
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(TEMPLATES_DIR);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isDirectory()) {
    fail(`templates directory missing: ${TEMPLATES_DIR}`);
  }

  for (const [filename, validator] of Object.entries(TEMPLATE_MAP)) {
    const template = path.join(TEMPLATES_DIR, filename);
    if (!fs.existsSync(template) || !fs.statSync(template).isFile()) {
      fail(`shipped template missing: ${relToRoot(template)}`);
    }
    if (!fs.existsSync(validator) || !fs.statSync(validator).isFile()) {
      fail(`matching validator missing: ${relToRoot(validator)}`);
    }
    runTsValidator(validator, template);
  }

  for (const filename of WIKI_TEMPLATE_FILES) {
    const template = path.join(TEMPLATES_DIR, filename);
    if (!fs.existsSync(template) || !fs.statSync(template).isFile()) {
      fail(`shipped wiki template missing: ${relToRoot(template)}`);
    }
    ok(`shipped wiki template present: ${relToRoot(template)}`);
  }

  // The wiki structure validator covers wiki templates collectively via
  // --self-test, which we invoke here as part of the meta-check.
  const wikiValidator = path.join(ROOT, 'scripts', 'validate-wiki-structure.ts');
  if (!fs.existsSync(wikiValidator) || !fs.statSync(wikiValidator).isFile()) {
    fail(`matching validator missing: ${relToRoot(wikiValidator)}`);
  }
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', wikiValidator, '--self-test'],
    { encoding: 'utf-8', cwd: ROOT },
  );
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail('wiki structure validator self-test failed');
  }
  ok('wiki structure validator self-test passed');

  process.stdout.write('VALIDATE_MEMORY_TEMPLATES_OK\n');
  return 0;
}

function runSelfTest(): number {
  // The meta-validator's self-test simply invokes the normal run; if any
  // per-surface validator is missing or any template is missing, the
  // default run path already reports it with a clear cite. We re-emit a
  // dedicated tag so callers can grep for it.
  const rc = run();
  if (rc === 0) {
    process.stdout.write('VALIDATE_MEMORY_TEMPLATES_SELF_TEST_OK\n');
  }
  return rc;
}

function main(argv?: string[]): number {
  const args = argv ?? process.argv.slice(2);
  if (args.includes('--self-test')) {
    return runSelfTest();
  }
  return run();
}

process.exit(main());
