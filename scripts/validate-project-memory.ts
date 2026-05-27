#!/usr/bin/env node
/**
 * Validate a project-memory.json document against the repo schema.
 *
 * Usage:
 *   node --experimental-strip-types scripts/validate-project-memory.ts [path]
 *   node --experimental-strip-types scripts/validate-project-memory.ts --self-test
 *
 * The schema (see docs/templates/project-memory.json):
 *
 *   - version (int, currently 1)
 *   - task (string, may be empty)
 *   - techStack (object: languages[], frameworks[], tooling[])
 *   - build (object: install, test, lint, typecheck — all strings)
 *   - conventions (object: indent, filenameCase, moduleLayout — all strings)
 *   - structure (object: src, tests, docs — all strings)
 *   - userOwned (object: customNotes[], directives[] — both string arrays)
 *   - hotPaths (string array)
 *
 * `userOwned.customNotes` and `userOwned.directives` are user-protected:
 * the validator does not enforce content, only the array-of-strings shape,
 * so automated agents can safely append to them without overwriting prior
 * entries.
 *
 * `--self-test` mode is fully isolated under `fs.mkdtempSync(os.tmpdir())`
 * and seeds one clean fixture plus four negative fixtures.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const TEMPLATE_PATH = path.join(ROOT, 'docs', 'templates', 'project-memory.json');

const ALLOWED_TOP_KEYS = new Set([
  '$comment',
  'version',
  'task',
  'techStack',
  'build',
  'conventions',
  'structure',
  'userOwned',
  'hotPaths',
]);
const ALLOWED_TECHSTACK_KEYS = new Set(['languages', 'frameworks', 'tooling']);
const ALLOWED_BUILD_KEYS = new Set(['install', 'test', 'lint', 'typecheck']);
const ALLOWED_CONVENTIONS_KEYS = new Set(['indent', 'filenameCase', 'moduleLayout']);
const ALLOWED_STRUCTURE_KEYS = new Set(['src', 'tests', 'docs']);
const ALLOWED_USEROWNED_KEYS = new Set(['$comment', 'customNotes', 'directives']);

class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message);
}

function ok(message: string): void {
  console.log(`ok: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireKeys(obj: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const extra = Object.keys(obj).filter(k => !allowed.has(k)).sort();
  if (extra.length > 0) {
    const formatted = '[' + extra.map(k => `'${k}'`).join(', ') + ']';
    fail(`${label} contains unsupported fields: ${formatted}`);
  }
}

function requireStrArray(obj: unknown, label: string): void {
  if (!Array.isArray(obj)) {
    fail(`${label} must be an array`);
  }
  for (let index = 0; index < obj.length; index++) {
    if (typeof obj[index] !== 'string') {
      fail(`${label}[${index}] must be a string`);
    }
  }
}

function requireStrDict(obj: unknown, allowed: Set<string>, label: string): void {
  if (!isPlainObject(obj)) {
    fail(`${label} must be an object`);
  }
  requireKeys(obj, allowed, label);
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'string') {
      fail(`${label}.${key} must be a string`);
    }
  }
}

function validate(filePath: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    fail(`project memory file not found: ${filePath}`);
  }
  if (!stat.isFile()) {
    fail(`project memory file not found: ${filePath}`);
  }

  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch (exc: any) {
    fail(`could not read ${filePath}: ${exc?.message || exc}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (exc: any) {
    fail(`project memory is not valid JSON: ${exc?.message || exc}`);
  }

  if (!isPlainObject(data)) {
    fail('project memory root must be a JSON object');
  }

  requireKeys(data, ALLOWED_TOP_KEYS, 'project-memory');

  for (const required of ['version', 'task', 'techStack', 'build', 'conventions', 'structure', 'userOwned', 'hotPaths']) {
    if (!(required in data)) {
      fail(`project-memory missing required key: ${required}`);
    }
  }

  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version !== 1) {
    fail('version must be the integer 1 (only schema version supported)');
  }
  if (typeof data.task !== 'string') {
    fail('task must be a string (may be empty)');
  }

  const techStack = data.techStack;
  if (!isPlainObject(techStack)) {
    fail('techStack must be an object');
  }
  requireKeys(techStack, ALLOWED_TECHSTACK_KEYS, 'techStack');
  for (const key of ALLOWED_TECHSTACK_KEYS) {
    if (!(key in techStack)) {
      fail(`techStack missing required key: ${key}`);
    }
    requireStrArray(techStack[key], `techStack.${key}`);
  }

  requireStrDict(data.build, ALLOWED_BUILD_KEYS, 'build');
  for (const key of ALLOWED_BUILD_KEYS) {
    if (!(key in (data.build as Record<string, unknown>))) {
      fail(`build missing required key: ${key}`);
    }
  }

  requireStrDict(data.conventions, ALLOWED_CONVENTIONS_KEYS, 'conventions');
  for (const key of ALLOWED_CONVENTIONS_KEYS) {
    if (!(key in (data.conventions as Record<string, unknown>))) {
      fail(`conventions missing required key: ${key}`);
    }
  }

  requireStrDict(data.structure, ALLOWED_STRUCTURE_KEYS, 'structure');
  for (const key of ALLOWED_STRUCTURE_KEYS) {
    if (!(key in (data.structure as Record<string, unknown>))) {
      fail(`structure missing required key: ${key}`);
    }
  }

  const userOwned = data.userOwned;
  if (!isPlainObject(userOwned)) {
    fail('userOwned must be an object');
  }
  requireKeys(userOwned, ALLOWED_USEROWNED_KEYS, 'userOwned');
  for (const key of ['customNotes', 'directives']) {
    if (!(key in userOwned)) {
      fail(`userOwned missing required key: ${key}`);
    }
    requireStrArray(userOwned[key], `userOwned.${key}`);
  }

  requireStrArray(data.hotPaths, 'hotPaths');

  ok(`project memory is valid: ${filePath}`);
}

// ---------------------------------------------------------------------------
// --self-test
// ---------------------------------------------------------------------------

const CLEAN_FIXTURE = {
  version: 1,
  task: '',
  techStack: { languages: ['python'], frameworks: [], tooling: ['pytest'] },
  build: { install: '', test: 'pytest', lint: '', typecheck: '' },
  conventions: { indent: '4 spaces', filenameCase: 'snake_case', moduleLayout: '' },
  structure: { src: 'src/', tests: 'tests/', docs: 'docs/' },
  userOwned: { customNotes: ['note one'], directives: ['never push to main'] },
  hotPaths: ['scripts/validate-workflow-state.py'],
};

function tryValidateExpectingFailure(filePath: string, label: string): boolean {
  try {
    validate(filePath);
  } catch (exc) {
    if (exc instanceof ValidationError) {
      ok(`self-test detected ${label}`);
      return true;
    }
    throw exc;
  }
  console.error(`FAIL: ${label} not detected`);
  return false;
}

function runSelfTest(): number {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-project-memory-'));
  try {
    const clean = path.join(sandbox, 'clean.json');
    fs.writeFileSync(clean, JSON.stringify(CLEAN_FIXTURE, null, 2), 'utf-8');
    validate(clean);

    const badVersion = path.join(sandbox, 'bad-version.json');
    const badVersionData = { ...CLEAN_FIXTURE, version: 2 };
    fs.writeFileSync(badVersion, JSON.stringify(badVersionData), 'utf-8');
    if (!tryValidateExpectingFailure(badVersion, 'bad-version')) return 1;

    const badMissing = path.join(sandbox, 'missing-userowned.json');
    const badMissingData: Record<string, unknown> = { ...CLEAN_FIXTURE };
    delete badMissingData.userOwned;
    fs.writeFileSync(badMissing, JSON.stringify(badMissingData), 'utf-8');
    if (!tryValidateExpectingFailure(badMissing, 'missing-userowned')) return 1;

    const badType = path.join(sandbox, 'bad-type.json');
    const badTypeData = JSON.parse(JSON.stringify(CLEAN_FIXTURE));
    badTypeData.techStack.languages = 'python';
    fs.writeFileSync(badType, JSON.stringify(badTypeData), 'utf-8');
    if (!tryValidateExpectingFailure(badType, 'bad-type')) return 1;

    const badExtra = path.join(sandbox, 'bad-extra.json');
    const badExtraData = JSON.parse(JSON.stringify(CLEAN_FIXTURE));
    badExtraData.surprise = 'field';
    fs.writeFileSync(badExtra, JSON.stringify(badExtraData), 'utf-8');
    if (!tryValidateExpectingFailure(badExtra, 'bad-extra')) return 1;
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  if (fs.existsSync(TEMPLATE_PATH) && fs.statSync(TEMPLATE_PATH).isFile()) {
    validate(TEMPLATE_PATH);
    ok(`shipped template passes: ${path.relative(ROOT, TEMPLATE_PATH)}`);
  } else {
    console.error(`FAIL: shipped template missing: ${TEMPLATE_PATH}`);
    return 1;
  }

  console.log('VALIDATE_PROJECT_MEMORY_SELF_TEST_OK');
  return 0;
}

function main(argv?: string[]): number {
  const args = argv ?? process.argv.slice(2);
  if (args.includes('--self-test')) {
    return runSelfTest();
  }
  const target = args.length > 0 ? args[0] : TEMPLATE_PATH;
  try {
    validate(target);
  } catch (exc) {
    if (exc instanceof ValidationError) {
      console.error(`FAIL: ${exc.message}`);
      return 1;
    }
    throw exc;
  }
  console.log('VALIDATE_PROJECT_MEMORY_OK');
  return 0;
}

process.exit(main());
