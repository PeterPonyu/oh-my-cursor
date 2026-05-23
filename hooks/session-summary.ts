import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveWorkspaceRoot } from './_repo.ts';
import { trace } from './_trace.ts';

const currentFile = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = resolveWorkspaceRoot(currentFile);

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
    const pending: string[] = [];
    const failed: string[] = [];
    const criteria = data.acceptance_criteria;
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
      phase: data.phase,
      status: data.status,
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
      fail_open: true,
      message: 'Session-summary input was not JSON; skipped.'
    }));
    return 0;
  }

  let finalStatus = '';
  for (const key of ['final_status', 'status', 'result', 'outcome']) {
    const value = payload?.[key];
    if (typeof value === 'string') {
      finalStatus = value;
      break;
    }
  }

  const durationMs = payload?.duration_ms || null;

  const statePath = resolveStatePath(payload);
  const stateSummary = statePath ? summarizeState(statePath) : { loaded: false };

  const output = {
    status: 'pass',
    fail_open: true,
    session: {
      session_id: payload?.session_id || null,
      reason: payload?.reason || null,
      final_status: finalStatus,
      duration_ms: durationMs,
      error_message: payload?.error_message || null,
    },
    workflow_state: {
      path: statePath,
      loaded: stateSummary.loaded,
      phase: stateSummary.phase || null,
      status: stateSummary.status || null,
      pending_criteria: stateSummary.pending_criteria || [],
      failed_criteria: stateSummary.failed_criteria || [],
    },
    message: 'Session-summary observed closure; no enforcement.',
  };

  trace({
    hook: 'session-summary',
    event: 'sessionEnd',
    session_id: payload?.session_id || null,
    final_status: finalStatus,
    duration_ms: durationMs,
    state_loaded: stateSummary.loaded,
    pending_criteria: (stateSummary.pending_criteria || []).slice(0, 5),
    failed_criteria: (stateSummary.failed_criteria || []).slice(0, 5),
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
