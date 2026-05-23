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
      fail_open: true,
      user_message: '',
      message: 'Compact-reminder input was not JSON; skipped.'
    }));
    return 0;
  }

  let trigger = '';
  for (const key of ['trigger', 'compaction_trigger']) {
    const value = payload?.[key];
    if (typeof value === 'string' && value) {
      trigger = value;
      break;
    }
  }

  const statePath = resolveStatePath(payload);
  const stateSummary = statePath ? summarizeState(statePath) : { loaded: false };

  const parts: string[] = [];
  if (stateSummary.loaded) {
    parts.push('Compact-reminder: keep the orchestration anchors in the post-compact summary.');
    parts.push(
      `phase=${stateSummary.phase || '?'}, status=${stateSummary.status || '?'}` +
      (stateSummary.current_role ? `, role=${stateSummary.current_role}` : '') + '.'
    );
    if (stateSummary.failed_criteria && stateSummary.failed_criteria.length > 0) {
      parts.push(`Failed AC: ${stateSummary.failed_criteria.join(', ')}.`);
    }
    if (stateSummary.pending_criteria && stateSummary.pending_criteria.length > 0) {
      parts.push(`Pending AC: ${stateSummary.pending_criteria.join(', ')}.`);
    }
    if (stateSummary.next_action) {
      parts.push(`Recorded next action: ${stateSummary.next_action}.`);
    }
  } else {
    parts.push(
      'Compact-reminder: no active workflow-state document was reachable at ' +
      '.cursor/state/workflow-state.json or via override. If a task is in ' +
      'flight, run `state_init` through the cursor-state-bridge MCP server ' +
      '(or `python3 scripts/workflow-state.py init ...` from the repo root) before the ' +
      'next compaction so the post-compact summary keeps the orchestration ' +
      'anchors.'
    );
  }

  const output = {
    status: 'pass',
    fail_open: true,
    user_message: parts.join(' '),
    trigger,
    workflow_state: {
      path: statePath,
      loaded: stateSummary.loaded,
      phase: stateSummary.phase || null,
      status: stateSummary.status || null,
      current_role: stateSummary.current_role || null,
      pending_criteria: stateSummary.pending_criteria || [],
      failed_criteria: stateSummary.failed_criteria || [],
    },
  };

  trace({
    hook: 'compact-reminder',
    event: 'preCompact',
    trigger,
    state_loaded: stateSummary.loaded,
    phase: stateSummary.phase,
    pending_criteria: (stateSummary.pending_criteria || []).slice(0, 5),
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
