import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveWorkspaceRoot } from './_repo.ts';
import { trace } from './_trace.ts';

const currentFile = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = resolveWorkspaceRoot(currentFile);

const ERROR_STATUSES = new Set(['error', 'failed', 'failure']);

function readPayload(): any {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw.trim()) {
      return {};
    }
    return JSON.parse(raw);
  } catch (err: any) {
    return { _invalid_json: true };
  }
}

function firstString(payload: any, keys: string[]): string {
  if (!payload || typeof payload !== 'object') return '';
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

function getLoopCount(payload: any): number {
  if (!payload || typeof payload !== 'object') return 0;
  for (const key of ['loop_count', 'loopCount', 'current_loop', 'currentLoop']) {
    const value = payload[key];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
  }
  return 0;
}

function resolveStatePath(payload: any): string | null {
  const candidates: string[] = [];
  const envPath = process.env.OH_MY_CURSOR_WORKFLOW_STATE;
  if (envPath) {
    candidates.push(envPath);
  }
  const payloadPath = payload?.workflow_state;
  if (typeof payloadPath === 'string') {
    candidates.push(payloadPath);
  }
  candidates.push(path.join(WORKSPACE_ROOT, '.cursor', 'state', 'workflow-state.json'));

  for (const raw of candidates) {
    try {
      let candidate = raw;
      if (candidate.startsWith('~')) {
        const homedir = process.env.HOME || '';
        candidate = path.join(homedir, candidate.slice(1));
      }
      if (!path.isAbsolute(candidate)) {
        candidate = path.resolve(WORKSPACE_ROOT, candidate);
      }
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function summarizeState(statePath: string): any {
  try {
    const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    if (!data || typeof data !== 'object') {
      return { loaded: false };
    }
    const criteria = data.acceptance_criteria;
    const pending: string[] = [];
    const failed: string[] = [];
    if (Array.isArray(criteria)) {
      for (const item of criteria) {
        if (!item || typeof item !== 'object') continue;
        const status = String(item.status || '').toLowerCase();
        const label = String(item.id || item.criterion || '').trim();
        if (!label) continue;
        if (status === 'failed') {
          failed.push(label);
        } else if (status !== 'passed' && status !== 'skipped') {
          pending.push(label);
        }
      }
    }
    return {
      loaded: true,
      task_id: data.task_id,
      phase: data.phase,
      status: data.status,
      current_role: data.current_role,
      next_action: data.next_action,
      pending_criteria: pending.slice(0, 10),
      failed_criteria: failed.slice(0, 10),
    };
  } catch {
    return { loaded: false };
  }
}

function main(): number {
  const payload = readPayload();
  if (payload?._invalid_json) {
    console.log(JSON.stringify({
      status: 'pass',
      continue: false,
      message: 'Stop hook input was not JSON; skipped audit.'
    }));
    return 0;
  }

  const status = firstString(payload, ['status', 'final_status', 'outcome', 'result']).toLowerCase();
  const loopCount = getLoopCount(payload);
  const shouldContinue = ERROR_STATUSES.has(status) && loopCount < 1;

  let baseMessage = (
    'Before final delivery, verify every acceptance criterion with fresh evidence and keep runtime claims bounded to checked-in artifacts plus actual smoke results.'
  );
  if (shouldContinue) {
    baseMessage = (
      'The stop event reports an error. One conservative follow-up is allowed to collect failure evidence, fix only the blocking issue, and rerun the relevant check.'
    );
  }

  const statePath = resolveStatePath(payload);
  const stateSummary = statePath ? summarizeState(statePath) : { loaded: false };

  const parts = [baseMessage];
  if (stateSummary.loaded) {
    if (stateSummary.failed_criteria && stateSummary.failed_criteria.length > 0) {
      parts.push(`Workflow state reports failed acceptance criteria: ${stateSummary.failed_criteria.join(', ')}.`);
    }
    if (stateSummary.pending_criteria && stateSummary.pending_criteria.length > 0) {
      parts.push(`Workflow state still has pending acceptance criteria: ${stateSummary.pending_criteria.join(', ')}.`);
    }
    if (stateSummary.next_action) {
      parts.push(`Next recorded action: ${stateSummary.next_action}.`);
    }
  }

  const userMessage = parts.join(' ');

  const output = {
    status: shouldContinue ? 'followup-requested' : 'pass',
    continue: shouldContinue,
    loop_limit: 1,
    loop_count: loopCount,
    user_facing_message: userMessage,
    additional_context: shouldContinue ? userMessage : '',
    workflow_state: {
      path: statePath,
      loaded: stateSummary.loaded,
      task_id: stateSummary.task_id || null,
      phase: stateSummary.phase || null,
      status: stateSummary.status || null,
      current_role: stateSummary.current_role || null,
      pending_criteria: stateSummary.pending_criteria || [],
      failed_criteria: stateSummary.failed_criteria || [],
    },
  };

  trace({
    hook: 'stop-gate',
    event: 'stop',
    status: output.status,
    continue: shouldContinue,
    loop_count: loopCount,
    state_loaded: stateSummary.loaded,
    pending_criteria: (stateSummary.pending_criteria || []).slice(0, 5),
    failed_criteria: (stateSummary.failed_criteria || []).slice(0, 5),
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
