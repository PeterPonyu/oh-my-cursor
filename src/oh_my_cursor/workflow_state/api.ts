import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileLock } from './locking.ts';
export { fileLock };

export const DEFAULT_HISTORY_CAP = 1000;

export const PHASES = new Set(['intake', 'research', 'plan', 'execute', 'verify', 'review', 'done', 'blocked']);
export const STATUSES = new Set(['pending', 'in_progress', 'passed', 'failed', 'blocked']);
export const ROLES = new Set([
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
export const AC_STATUSES = new Set(['pending', 'passed', 'failed', 'skipped']);
export const FAILURE_TYPES = new Set([
  '',
  'transient',
  'fixable',
  'needs_replan',
  'escalate',
  'flaky',
  'regression',
]);

function _fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function _loadState(targetPath: string): any {
  if (!fs.existsSync(targetPath)) {
    _fail(`state file does not exist: ${targetPath}`);
  }
  let content: string;
  try {
    content = fs.readFileSync(targetPath, 'utf-8');
  } catch (err: any) {
    _fail(`failed to read state file: ${err.message}`);
  }
  let value: any;
  try {
    value = JSON.parse(content);
  } catch (err: any) {
    _fail(`state file is not valid JSON: ${err.message}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    _fail('state root must be a JSON object');
  }
  return value;
}

function _atomicWriteState(targetPath: string, state: any): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const data = JSON.stringify(state, null, 2) + '\n';
  const tmpName = path.join(
    dir,
    `.${path.basename(targetPath)}.${Math.random().toString(36).slice(2)}.${process.pid}.tmp`
  );
  try {
    const stat = fs.lstatSync(tmpName);
    if (stat.isSymbolicLink()) {
      throw new Error(`unsafe workflow-state temp symlink: ${tmpName}`);
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
  fs.writeFileSync(tmpName, data, { encoding: 'utf-8', flag: 'wx' });
  try {
    fs.renameSync(tmpName, targetPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpName);
    } catch {}
    throw err;
  }
}

function _pushHistory(
  state: any,
  note: string,
  opts?: { phase?: string | null; status?: string | null }
): void {
  if (!state.history || !Array.isArray(state.history)) {
    state.history = [];
  }
  const today = new Date().toISOString().split('T')[0];
  state.history.push({
    phase: opts?.phase !== undefined && opts.phase !== null ? opts.phase : String(state.phase || ''),
    status: opts?.status !== undefined && opts.status !== null ? opts.status : String(state.status || ''),
    note: note,
    at: today,
  });
}

function _compactHistory(state: any, cap: number = DEFAULT_HISTORY_CAP): void {
  if (typeof cap !== 'number' || cap <= 0) {
    return;
  }
  if (!state.history || !Array.isArray(state.history)) {
    return;
  }
  if (state.history.length <= cap) {
    return;
  }
  state.history = state.history.slice(-cap);
}

export function readState(targetPath: string): any | null {
  if (!fs.existsSync(targetPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`state file is not valid JSON: ${err.message}`);
  }
}

export function initState(
  targetPath: string,
  opts: {
    task_id: string;
    title?: string;
    phase?: string;
    status?: string;
    role?: string;
    next_action?: string;
    history_cap?: number;
  }
): any {
  const resolvedPath = path.resolve(targetPath);
  if (fs.existsSync(resolvedPath)) {
    throw new Error(
      `workflow-state already exists at ${resolvedPath}; use set_state() to mutate, or remove the file first`
    );
  }

  const phase = opts.phase || 'intake';
  const status = opts.status || 'pending';
  const role = opts.role || 'orchestrator';
  const next_action = opts.next_action || 'define acceptance criteria and route to orchestrator';
  const history_cap = opts.history_cap !== undefined ? opts.history_cap : DEFAULT_HISTORY_CAP;

  if (!PHASES.has(phase)) {
    _fail(`phase must be one of ${Array.from(PHASES).sort().join(', ')}`);
  }
  if (!STATUSES.has(status)) {
    _fail(`status must be one of ${Array.from(STATUSES).sort().join(', ')}`);
  }
  if (!ROLES.has(role)) {
    _fail(`role must be one of ${Array.from(ROLES).sort().join(', ')}`);
  }

  const state: any = {
    task_id: opts.task_id,
    title: opts.title || opts.task_id,
    phase,
    status,
    current_role: role,
    next_action,
    acceptance_criteria: [],
    failure: { type: '', message: '', retry_count: 0 },
    history: [],
  };

  _pushHistory(state, 'initialized workflow state');
  _compactHistory(state, history_cap);

  fileLock(resolvedPath, () => {
    _atomicWriteState(resolvedPath, state);
  });

  return state;
}

const TASK_ID_SAFE_RE = /^[A-Za-z0-9._-]+$/;

function _sanitizeTaskId(raw: string): string {
  if (TASK_ID_SAFE_RE.test(raw)) {
    return raw;
  }
  return raw.replace(/[^A-Za-z0-9._-]/g, '_');
}

function _archiveSession(resolvedPath: string, state: any): void {
  const sessionsDir = path.join(path.dirname(resolvedPath), 'sessions');
  try {
    fs.mkdirSync(sessionsDir, { recursive: true });
  } catch (err: any) {
    console.error(`Warning: failed to create sessions directory: ${err.message}`);
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const taskId = _sanitizeTaskId(String(state.task_id || 'session'));
  const sessionId = state.session_id || Math.random().toString(36).slice(2) + '-' + Date.now();

  const archiveState = {
    ...state,
    session_id: sessionId,
    session_archived_at: new Date().toISOString()
  };

  const archiveFile = path.join(sessionsDir, `session-${taskId}-${timestamp}.json`);

  // Guard: ensure resolved archive path stays inside sessionsDir
  const resolvedArchive = path.resolve(archiveFile);
  const resolvedSessions = path.resolve(sessionsDir);
  if (!resolvedArchive.startsWith(resolvedSessions + path.sep)) {
    console.error(`Warning: archive path escaped sessions directory (task_id: ${state.task_id}); skipping archive`);
    return;
  }
  const data = JSON.stringify(archiveState, null, 2) + '\n';
  try {
    fs.writeFileSync(archiveFile, data, 'utf-8');
  } catch (err: any) {
    console.error(`Warning: failed to write session archive: ${err.message}`);
    return;
  }

  const cap = state.session_cap !== undefined ? state.session_cap : 10;
  try {
    const files = fs.readdirSync(sessionsDir)
      .filter(f => f.startsWith('session-') && f.endsWith('.json'))
      .map(f => {
        const full = path.join(sessionsDir, f);
        return { name: full, mtime: fs.statSync(full).mtimeMs };
      });
    
    files.sort((a, b) => a.mtime - b.mtime);
    while (files.length > cap) {
      const toRemove = files.shift();
      if (toRemove) {
        fs.unlinkSync(toRemove.name);
      }
    }
  } catch (err: any) {
    console.error(`Warning: failed during session pruning: ${err.message}`);
  }
}

export function setState(
  targetPath: string,
  opts: {
    phase?: string | null;
    status?: string | null;
    role?: string | null;
    next_action?: string | null;
    note?: string;
    history_cap?: number;
  }
): any {
  const resolvedPath = path.resolve(targetPath);
  const phase = opts.phase;
  const status = opts.status;
  const role = opts.role;
  const next_action = opts.next_action;
  const note = opts.note || 'updated workflow state';
  const history_cap = opts.history_cap !== undefined ? opts.history_cap : DEFAULT_HISTORY_CAP;

  if (phase !== undefined && phase !== null && !PHASES.has(phase)) {
    _fail(`phase must be one of ${Array.from(PHASES).sort().join(', ')}`);
  }
  if (status !== undefined && status !== null && !STATUSES.has(status)) {
    _fail(`status must be one of ${Array.from(STATUSES).sort().join(', ')}`);
  }
  if (role !== undefined && role !== null && !ROLES.has(role)) {
    _fail(`role must be one of ${Array.from(ROLES).sort().join(', ')}`);
  }

  return fileLock(resolvedPath, () => {
    const state = _loadState(resolvedPath);
    const oldPhase = state.phase;
    if (phase !== undefined && phase !== null) {
      state.phase = phase;
    }
    if (status !== undefined && status !== null) {
      state.status = status;
    }
    if (role !== undefined && role !== null) {
      state.current_role = role;
    }
    if (next_action !== undefined && next_action !== null) {
      state.next_action = next_action;
    }
    _pushHistory(state, note);
    _compactHistory(state, history_cap);
    _atomicWriteState(resolvedPath, state);

    if (state.phase === 'done' && oldPhase !== 'done') {
      _archiveSession(resolvedPath, state);
    }

    return state;
  });
}

export function updateAcceptanceCriterion(
  targetPath: string,
  opts: {
    ac_id: string;
    status: string;
    criterion?: string | null;
    evidence?: string | null;
    note?: string;
    history_cap?: number;
  }
): any {
  const resolvedPath = path.resolve(targetPath);
  const ac_id = opts.ac_id;
  const status = opts.status;
  const criterion = opts.criterion;
  const evidence = opts.evidence;
  const note = opts.note || '';
  const history_cap = opts.history_cap !== undefined ? opts.history_cap : DEFAULT_HISTORY_CAP;

  if (!AC_STATUSES.has(status)) {
    _fail(`acceptance criterion status must be one of ${Array.from(AC_STATUSES).sort().join(', ')}`);
  }

  return fileLock(resolvedPath, () => {
    const state = _loadState(resolvedPath);
    if (!state.acceptance_criteria || !Array.isArray(state.acceptance_criteria)) {
      state.acceptance_criteria = [];
    }

    let target: any = null;
    for (const item of state.acceptance_criteria) {
      if (item && item.id === ac_id) {
        target = item;
        break;
      }
    }

    if (target === null) {
      state.acceptance_criteria.push({
        id: ac_id,
        criterion: criterion !== undefined && criterion !== null ? criterion : ac_id,
        status: status,
        evidence: evidence || '',
      });
    } else {
      if (criterion !== undefined && criterion !== null) {
        target.criterion = criterion;
      }
      target.status = status;
      if (evidence !== undefined && evidence !== null) {
        target.evidence = evidence;
      }
    }

    _pushHistory(state, note || `updated acceptance criterion ${ac_id}`);
    _compactHistory(state, history_cap);
    _atomicWriteState(resolvedPath, state);
    return state;
  });
}

export function recordFailure(
  targetPath: string,
  opts: {
    type?: string;
    message?: string;
    retry_count?: number;
    note?: string;
    history_cap?: number;
  }
): any {
  const resolvedPath = path.resolve(targetPath);
  const type = opts.type !== undefined ? opts.type : 'fixable';
  const message = opts.message || '';
  const retry_count = opts.retry_count !== undefined ? opts.retry_count : 0;
  const note = opts.note || '';
  const history_cap = opts.history_cap !== undefined ? opts.history_cap : DEFAULT_HISTORY_CAP;

  if (!FAILURE_TYPES.has(type)) {
    _fail(`failure type must be one of ${Array.from(FAILURE_TYPES).sort().join(', ')}`);
  }
  if (retry_count < 0 || retry_count > 3) {
    _fail('retry-count must be between 0 and 3');
  }

  return fileLock(resolvedPath, () => {
    const state = _loadState(resolvedPath);
    state.status = type ? 'failed' : (state.status || 'failed');
    state.failure = { type, message, retry_count };

    _pushHistory(state, note || `recorded failure type ${type}`);
    _compactHistory(state, history_cap);
    _atomicWriteState(resolvedPath, state);
    return state;
  });
}

export function appendHistory(
  targetPath: string,
  opts: {
    note: string;
    phase?: string | null;
    status?: string | null;
    history_cap?: number;
  }
): any {
  const resolvedPath = path.resolve(targetPath);
  const note = opts.note;
  const phase = opts.phase;
  const status = opts.status;
  const history_cap = opts.history_cap !== undefined ? opts.history_cap : DEFAULT_HISTORY_CAP;

  return fileLock(resolvedPath, () => {
    const state = _loadState(resolvedPath);
    _pushHistory(state, note, { phase, status });
    _compactHistory(state, history_cap);
    _atomicWriteState(resolvedPath, state);
    return state;
  });
}
