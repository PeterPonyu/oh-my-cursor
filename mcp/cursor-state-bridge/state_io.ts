import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveJailed } from './jail.ts';
import * as api from '../../src/oh_my_cursor/workflow_state/api.ts';

function resolveStatePath(workspace: string, taskId: string | null | undefined): string {
  const ws = path.resolve(workspace);
  let target: string;
  if (taskId) {
    target = path.join(ws, 'docs', 'plans', taskId, 'workflow-state.json');
  } else {
    target = path.join(ws, '.cursor', 'state', 'workflow-state.json');
  }
  return resolveJailed(ws, target);
}

function mcpText(payload: any): any {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return { content: [{ type: 'text', text }] };
}

const DEFAULT_HISTORY_CAP = 1000;

function getHistoryCap(params: any): number {
  const raw = params.history_cap;
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string' && /^-?\d+$/.test(raw)) {
    try {
      return parseInt(raw, 10);
    } catch {
      return DEFAULT_HISTORY_CAP;
    }
  }
  return DEFAULT_HISTORY_CAP;
}

export function state_read(workspace: string, params: any): any {
  const wsOverride = params.workspace;
  const activeWorkspace = wsOverride ? path.resolve(wsOverride) : workspace;
  const target = resolveStatePath(activeWorkspace, params.task_id);
  if (!fs.existsSync(target)) {
    return mcpText('no state');
  }
  let parsed: any;
  try {
    const raw = fs.readFileSync(target, 'utf-8');
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`state file parse error: ${err.message}`);
  }
  return mcpText(parsed);
}

export function state_init(workspace: string, params: any): any {
  const taskId = params.task_id;
  if (typeof taskId !== 'string' || !taskId) {
    throw new Error('state_init: task_id is required');
  }
  const scopePerTask = params.scope_per_task !== undefined ? params.scope_per_task : true;
  const target = resolveStatePath(workspace, scopePerTask ? taskId : null);
  const state = api.initState(target, {
    task_id: taskId,
    title: params.title !== undefined ? String(params.title) : undefined,
    phase: params.phase !== undefined ? String(params.phase) : undefined,
    status: params.status !== undefined ? String(params.status) : undefined,
    role: params.role !== undefined ? String(params.role) : undefined,
    next_action: params.next_action !== undefined ? String(params.next_action) : undefined,
    history_cap: getHistoryCap(params),
  });
  return mcpText(state);
}

export function state_set_phase(workspace: string, params: any): any {
  const taskId = params.task_id;
  if (typeof taskId !== 'string' || !taskId) {
    throw new Error('state_set_phase: task_id is required');
  }
  const phase = params.phase;
  if (typeof phase !== 'string' || !phase) {
    throw new Error('state_set_phase: phase is required');
  }
  const target = resolveStatePath(workspace, taskId);
  const state = api.setState(target, {
    phase: phase,
    status: typeof params.status === 'string' ? params.status : null,
    role: typeof params.role === 'string' ? params.role : null,
    next_action: typeof params.next_action === 'string' ? params.next_action : null,
    note: typeof params.note === 'string' ? params.note : 'advanced phase via cursor-state-bridge',
    history_cap: getHistoryCap(params),
  });
  return mcpText(state);
}

export function state_record_failure(workspace: string, params: any): any {
  const taskId = params.task_id;
  if (typeof taskId !== 'string' || !taskId) {
    throw new Error('state_record_failure: task_id is required');
  }
  let message = params.message;
  if (typeof message !== 'string') {
    message = '';
  }
  let retryCount = params.retry_count;
  if (typeof retryCount !== 'number') {
    if (typeof retryCount === 'string') {
      try {
        retryCount = parseInt(retryCount, 10);
      } catch {
        retryCount = 0;
      }
    } else {
      retryCount = 0;
    }
  }
  const target = resolveStatePath(workspace, taskId);
  const state = api.recordFailure(target, {
    type: typeof params.type === 'string' ? params.type : 'fixable',
    message,
    retry_count: retryCount,
    note: typeof params.note === 'string' ? params.note : undefined,
    history_cap: getHistoryCap(params),
  });
  return mcpText(state);
}

export function state_update_acceptance_criterion(workspace: string, params: any): any {
  const taskId = params.task_id;
  if (typeof taskId !== 'string' || !taskId) {
    throw new Error('state_update_acceptance_criterion: task_id is required');
  }
  const acId = params.ac_id;
  if (typeof acId !== 'string' || !acId) {
    throw new Error('state_update_acceptance_criterion: ac_id is required');
  }
  const status = params.status;
  if (typeof status !== 'string' || !status) {
    throw new Error('state_update_acceptance_criterion: status is required');
  }
  const target = resolveStatePath(workspace, taskId);
  const state = api.updateAcceptanceCriterion(target, {
    ac_id: acId,
    status: status,
    criterion: typeof params.criterion === 'string' ? params.criterion : null,
    evidence: typeof params.evidence === 'string' ? params.evidence : null,
    note: typeof params.note === 'string' ? params.note : undefined,
    history_cap: getHistoryCap(params),
  });
  return mcpText(state);
}

export function state_history_append(workspace: string, params: any): any {
  const taskId = params.task_id;
  if (typeof taskId !== 'string' || !taskId) {
    throw new Error('state_history_append: task_id is required');
  }
  const note = params.note || params.event;
  if (typeof note !== 'string' || !note) {
    throw new Error('state_history_append: note (or event) is required');
  }
  const target = resolveStatePath(workspace, taskId);
  const state = api.appendHistory(target, {
    note: note,
    phase: typeof params.phase === 'string' ? params.phase : null,
    status: typeof params.status === 'string' ? params.status : null,
    history_cap: getHistoryCap(params),
  });
  return mcpText(state);
}
