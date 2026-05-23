import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const DEFAULT_TRACE = path.join(ROOT, '.omcs', 'cursor-state-bridge', 'trace.jsonl');
const SCHEMA_PATH = path.join(ROOT, 'mcp', 'cursor-state-bridge', 'fixtures', 'trace-schema.json');
const REQUIRED_KEYS = ['ts', 'tool', 'phase', 'result', 'duration_ms'];

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`ok: ${message}`);
}

function validateLines(lines: string[]): string[] {
  const errors: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch (exc: any) {
      errors.push(`line ${index}: malformed JSON: ${exc.message}`);
      continue;
    }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      errors.push(`line ${index}: not an object`);
      continue;
    }
    const keys = Object.keys(obj);
    const missing = REQUIRED_KEYS.filter(k => !keys.includes(k));
    if (missing.length > 0) {
      errors.push(`line ${index}: missing required keys: ${missing.sort().join(', ')}`);
      continue;
    }
    const dur = obj.duration_ms;
    if (typeof dur !== 'number') {
      errors.push(`line ${index}: duration_ms must be numeric`);
    }
  }
  return errors;
}

function runSelfTest(): void {
  const tmpDir = path.join(ROOT, '.omcs', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const sandbox = fs.mkdtempSync(path.join(tmpDir, 'mcp-trace-'));
  try {
    const clean = path.join(sandbox, 'clean.jsonl');
    fs.writeFileSync(
      clean,
      [
        JSON.stringify({
          ts: '2026-05-07T01:00:00Z',
          tool: 'state_read',
          phase: 'tools/call',
          result: 'ok',
          duration_ms: 12,
        }),
        JSON.stringify({
          ts: '2026-05-07T01:00:01Z',
          tool: 'state_init',
          phase: 'tools/call',
          result: 'ok',
          duration_ms: 8,
        }),
      ].join('\n') + '\n',
      'utf-8'
    );
    const cleanErrors = validateLines(fs.readFileSync(clean, 'utf-8').split(/\r?\n/));
    if (cleanErrors.length > 0) {
      fail(`self-test clean fixture rejected: ${JSON.stringify(cleanErrors)}`);
    }
    ok('self-test clean fixture passes');

    const bad = path.join(sandbox, 'bad.jsonl');
    fs.writeFileSync(
      bad,
      [
        JSON.stringify({ ts: '2026-05-07T01:00:00Z', tool: 'x' }),
        '{not valid json',
        JSON.stringify({
          ts: '2026-05-07T01:00:00Z',
          tool: 'y',
          phase: 'z',
          result: 'ok',
          duration_ms: 'not-a-number',
        }),
      ].join('\n') + '\n',
      'utf-8'
    );
    const badErrors = validateLines(fs.readFileSync(bad, 'utf-8').split(/\r?\n/));
    if (badErrors.length < 3) {
      fail(`self-test bad fixture should have surfaced >=3 errors, got ${badErrors.length}: ${JSON.stringify(badErrors)}`);
    }
    ok(`self-test bad fixture rejected with ${badErrors.length} errors`);
    console.log('VALIDATE_MCP_TRACE_SELF_TEST_OK');
  } finally {
    try {
      fs.rmSync(sandbox, { recursive: true, force: true });
    } catch {}
  }
}

function expandUser(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    runSelfTest();
    process.exit(0);
  }

  let tail = 50;
  let tracePath = DEFAULT_TRACE;

  while (args.length > 0) {
    const token = args.shift();
    if (token === '--tail') {
      const val = args.shift();
      if (!val) fail('missing value for --tail');
      tail = parseInt(val, 10);
      if (isNaN(tail)) fail(`invalid tail value: ${val}`);
    } else if (token === '--path') {
      const val = args.shift();
      if (!val) fail('missing value for --path');
      tracePath = path.resolve(expandUser(val));
    } else {
      fail(`unknown argument: ${token}`);
    }
  }

  if (!fs.existsSync(SCHEMA_PATH) || !fs.statSync(SCHEMA_PATH).isFile()) {
    fail(`schema fixture missing: ${SCHEMA_PATH}`);
  }
  if (!fs.existsSync(tracePath) || !fs.statSync(tracePath).isFile()) {
    fail(`trace file not found: ${tracePath}`);
  }

  const rawLines = fs.readFileSync(tracePath, 'utf-8').split(/\r?\n/);
  const relevant = rawLines.filter(line => line.trim()).slice(-tail);
  const errors = validateLines(relevant);
  if (errors.length > 0) {
    console.error('FAIL: trace validation errors:');
    for (const err of errors) {
      console.error(`  ${err}`);
    }
    process.exit(1);
  }
  ok(`last ${relevant.length} trace lines schema-conformant: ${tracePath}`);
  console.log('MCP_TRACE_OK');
  process.exit(0);
}

main();
