import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const SCHEMA_PATH = path.join(ROOT, '.cursor', 'state', 'workflow-state.schema.json');

const ALLOWED_PHASES = new Set(['intake', 'research', 'plan', 'execute', 'verify', 'review', 'done', 'blocked']);
const ALLOWED_STATUSES = new Set(['pending', 'in_progress', 'passed', 'failed', 'blocked']);
const ALLOWED_ROLES = new Set([
  '',
  'architect',
  'code-reviewer',
  'critic',
  'debugger',
  'explore',
  'implementer',
  'orchestrator',
  'planner',
  'qa-tester',
  'researcher',
  'security-reviewer',
  'test-engineer',
  'tracer',
  'verifier',
]);
const ALLOWED_AC_STATUSES = new Set(['pending', 'passed', 'failed', 'skipped']);
const ALLOWED_FAILURE_TYPES = new Set([
  '',
  'transient',
  'fixable',
  'needs_replan',
  'escalate',
  'flaky',
  'regression',
]);
const ALLOWED_TOP_KEYS = new Set([
  'task_id',
  'title',
  'phase',
  'status',
  'current_role',
  'next_action',
  'acceptance_criteria',
  'failure',
  'history',
  'tasks',
]);
const ALLOWED_AC_KEYS = new Set(['id', 'criterion', 'status', 'evidence']);
const ALLOWED_FAILURE_KEYS = new Set(['type', 'message', 'retry_count']);
const ALLOWED_HISTORY_KEYS = new Set(['phase', 'status', 'note', 'at', 'role']);

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`ok: ${message}`);
}

function expectKeys(obj: any, allowed: Set<string>, label: string): void {
  const keys = Object.keys(obj);
  const extra = keys.filter((k) => !allowed.has(k));
  if (extra.length > 0) {
    fail(`${label} contains unsupported fields: ${extra.sort().join(', ')}`);
  }
}

function validate(filePath: string): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    fail(`state file not found: ${filePath}`);
  }

  let data: any;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    data = JSON.parse(raw);
  } catch (err: any) {
    fail(`state file is not valid JSON: ${err.message}`);
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    fail('state file root must be a JSON object');
  }

  expectKeys(data, ALLOWED_TOP_KEYS, 'top-level state');

  for (const req of ['task_id', 'phase', 'status', 'acceptance_criteria']) {
    if (!(req in data)) {
      fail(`missing required field: ${req}`);
    }
  }

  if (typeof data.task_id !== 'string' || !data.task_id.trim()) {
    fail('task_id must be a non-empty string');
  }
  if (!ALLOWED_PHASES.has(data.phase)) {
    fail(`phase must be one of ${Array.from(ALLOWED_PHASES).sort().join(', ')}`);
  }
  if (!ALLOWED_STATUSES.has(data.status)) {
    fail(`status must be one of ${Array.from(ALLOWED_STATUSES).sort().join(', ')}`);
  }

  const role = data.current_role || '';
  if (!ALLOWED_ROLES.has(role)) {
    fail(`current_role must be one of ${Array.from(ALLOWED_ROLES).sort().join(', ')}`);
  }

  const criteria = data.acceptance_criteria;
  if (!Array.isArray(criteria)) {
    fail('acceptance_criteria must be an array');
  }
  const seenIds = new Set<string>();
  criteria.forEach((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      fail(`acceptance_criteria[${index}] must be an object`);
    }
    expectKeys(item, ALLOWED_AC_KEYS, `acceptance_criteria[${index}]`);
    for (const req of ['id', 'criterion', 'status']) {
      if (!(req in item)) {
        fail(`acceptance_criteria[${index}] missing required field: ${req}`);
      }
    }
    const acId = item.id;
    if (typeof acId !== 'string' || !acId.trim()) {
      fail(`acceptance_criteria[${index}].id must be a non-empty string`);
    }
    if (seenIds.has(acId)) {
      fail(`duplicate acceptance_criteria id: ${acId}`);
    }
    seenIds.add(acId);
    if (!ALLOWED_AC_STATUSES.has(item.status)) {
      fail(`acceptance_criteria[${index}].status must be one of ${Array.from(ALLOWED_AC_STATUSES).sort().join(', ')}`);
    }
  });

  const failure = data.failure;
  if (failure !== undefined && failure !== null) {
    if (typeof failure !== 'object' || Array.isArray(failure)) {
      fail('failure must be an object');
    }
    expectKeys(failure, ALLOWED_FAILURE_KEYS, 'failure');
    if ('type' in failure && !ALLOWED_FAILURE_TYPES.has(failure.type)) {
      fail(`failure.type must be one of ${Array.from(ALLOWED_FAILURE_TYPES).sort().join(', ')}`);
    }
    if ('retry_count' in failure) {
      const retry = failure.retry_count;
      if (typeof retry !== 'number' || retry < 0 || retry > 3) {
        fail('failure.retry_count must be an integer between 0 and 3');
      }
    }
  }

  const history = data.history;
  if (history !== undefined && history !== null) {
    if (!Array.isArray(history)) {
      fail('history must be an array');
    }
    history.forEach((item, index) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        fail(`history[${index}] must be an object`);
      }
      expectKeys(item, ALLOWED_HISTORY_KEYS, `history[${index}]`);
      for (const req of ['phase', 'status']) {
        if (!(req in item)) {
          fail(`history[${index}] missing required field: ${req}`);
        }
      }
    });
  }

  ok(`workflow-state document is valid: ${filePath}`);
}

function checkHistoryMonotonic(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    fail(`state file not found: ${filePath}`);
  }
  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err: any) {
    fail(`state file is not valid JSON: ${err.message}`);
  }
  const history = data.history || [];
  if (!Array.isArray(history)) {
    fail('history must be an array');
  }
  const ats: string[] = [];
  history.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      fail(`history[${index}] must be an object`);
    }
    const at = item.at || '';
    if (typeof at !== 'string') {
      fail(`history[${index}].at must be a string`);
    }
    ats.push(at);
  });
  const sortedAts = [...ats].sort();
  for (let i = 0; i < ats.length; i++) {
    if (ats[i] !== sortedAts[i]) {
      fail(
        'history[].at is not monotonic non-decreasing; ' +
        'concurrent writers may have interleaved without holding file_lock'
      );
    }
  }
  ok(`history[].at is monotonic non-decreasing (${ats.length} entries): ${filePath}`);
}

function checkHistoryCap(filePath: string, cap: number): void {
  if (!fs.existsSync(filePath)) {
    fail(`state file not found: ${filePath}`);
  }
  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err: any) {
    fail(`state file is not valid JSON: ${err.message}`);
  }
  const history = data.history || [];
  if (!Array.isArray(history)) {
    fail('history must be an array');
  }
  if (cap > 0 && history.length > cap) {
    fail(
      `history[] has ${history.length} entries; expected <= ${cap} ` +
      '(library compaction was bypassed or the cap was disabled at write time)'
    );
  }
  const ats: string[] = [];
  history.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      fail(`history[${index}] must be an object`);
    }
    const at = item.at || '';
    if (typeof at !== 'string') {
      fail(`history[${index}].at must be a string`);
    }
    ats.push(at);
  });
  const sortedAts = [...ats].sort();
  for (let i = 0; i < ats.length; i++) {
    if (ats[i] !== sortedAts[i]) {
      fail('history[].at is not monotonic non-decreasing after compaction');
    }
  }
  if (cap > 0) {
    ok(`history[] has ${history.length} entries (<= ${cap}) and is monotonic: ${filePath}`);
  } else {
    ok(`history[] is monotonic non-decreasing (${history.length} entries; cap disabled): ${filePath}`);
  }
}

function main(): void {
  const args = [...process.argv.slice(2)];
  let monotonicOnly = false;
  let capCheck: number | null = null;

  const monoIndex = args.indexOf('--check-history-monotonic');
  if (monoIndex !== -1) {
    args.splice(monoIndex, 1);
    monotonicOnly = true;
  }

  const capIndex = args.indexOf('--check-history-cap');
  if (capIndex !== -1) {
    if (capIndex + 1 >= args.length) {
      fail('--check-history-cap requires an integer argument');
    }
    capCheck = parseInt(args[capIndex + 1], 10);
    if (isNaN(capCheck)) {
      fail('--check-history-cap argument must be an integer');
    }
    args.splice(capIndex, 2);
  }

  const defaultPath = path.join(ROOT, '.cursor', 'state', 'workflow-state.example.json');
  const target = args[0] ? path.resolve(args[0]) : defaultPath;

  if (!fs.existsSync(SCHEMA_PATH)) {
    fail(`schema missing: ${SCHEMA_PATH}`);
  }

  if (capCheck !== null) {
    checkHistoryCap(target, capCheck);
    console.log('WORKFLOW_STATE_HISTORY_CAP_OK');
    return;
  }

  if (monotonicOnly) {
    checkHistoryMonotonic(target);
    console.log('WORKFLOW_STATE_HISTORY_MONOTONIC_OK');
    return;
  }

  validate(target);
  console.log('WORKFLOW_STATE_OK');
}

main();
