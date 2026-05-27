import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveRepoRoot } from './_repo.ts';
import { trace } from './_trace.ts';
import { clearActiveRole } from './_active_role.ts';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = resolveRepoRoot(currentFile);
const SUBAGENT_RUNS_PATH = path.join(ROOT, '.cursor', 'state', 'subagent-runs.json');
const STALL_THRESHOLD_MS = Number(process.env.OMCURSOR_SUBAGENT_STALL_MS) || 600_000;

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

function getStrField(payload: any, keys: string[]): string {
  if (!payload || typeof payload !== 'object') return '';
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return '';
}

function getIntField(payload: any, keys: string[]): number | null {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
  }
  return null;
}

function main(): number {
  const payload = readPayload();
  if (payload?._invalid_json) {
    console.log(JSON.stringify({
      status: 'pass',
      fail_open: true,
      message: 'Subagent-summary input was not JSON; skipped.'
    }));
    return 0;
  }

  const subagentType = getStrField(payload, ['subagent_type', 'subagentType', 'type']).toLowerCase();
  const status = getStrField(payload, ['status', 'final_status', 'outcome', 'result']).toLowerCase();
  const summary = getStrField(payload, ['summary', 'message']);
  const subagentId = getStrField(payload, ['subagent_id', 'subagentId', 'session_id', 'sessionId']);

  let stallStatus = 'pass';
  let stallMessage = 'No matching start record; stall check skipped.';
  let durationMs: number | null = null;
  try {
    let runs: any[] = [];
    if (fs.existsSync(SUBAGENT_RUNS_PATH)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(SUBAGENT_RUNS_PATH, 'utf-8'));
        if (Array.isArray(parsed)) runs = parsed;
      } catch {
        runs = [];
      }
    }
    let matchIdx = -1;
    if (subagentId) {
      matchIdx = runs.findIndex((e: any) => e && e.subagent_id === subagentId);
    }
    if (matchIdx === -1 && subagentType) {
      matchIdx = runs.findIndex((e: any) => e && e.role === subagentType);
    }
    if (matchIdx !== -1) {
      const entry = runs[matchIdx];
      durationMs = Date.now() - Number(entry.start_ts || 0);
      if (durationMs > STALL_THRESHOLD_MS) {
        stallStatus = 'warn';
        stallMessage = `Subagent \`${entry.role || subagentType}\` ran for ${Math.round(durationMs / 1000)}s, exceeding the ${Math.round(STALL_THRESHOLD_MS / 1000)}s stall threshold (override via OMCURSOR_SUBAGENT_STALL_MS).`;
      } else {
        stallStatus = 'pass';
        stallMessage = `Subagent \`${entry.role || subagentType}\` completed in ${Math.round(durationMs / 1000)}s, within stall threshold.`;
      }
      runs.splice(matchIdx, 1);
      fs.writeFileSync(SUBAGENT_RUNS_PATH, JSON.stringify(runs, null, 2));
    }
  } catch {
    stallStatus = 'pass';
    stallMessage = 'Stall check skipped due to I/O error.';
  }

  const modifiedFiles: string[] = [];
  const rawModified = payload?.modified_files || payload?.modifiedFiles;
  if (Array.isArray(rawModified)) {
    for (const item of rawModified) {
      if (typeof item === 'string') {
        modifiedFiles.push(item);
      }
    }
  }

  try {
    clearActiveRole();
  } catch {
    // ignore
  }

  const output = {
    status: stallStatus,
    fail_open: true,
    subagent: {
      subagent_type: subagentType,
      status: status,
      summary_excerpt: summary ? summary.slice(0, 200) : '',
      duration_ms: getIntField(payload, ['duration_ms', 'durationMs']),
      message_count: getIntField(payload, ['message_count', 'messageCount']),
      tool_call_count: getIntField(payload, ['tool_call_count', 'toolCallCount']),
      loop_count: getIntField(payload, ['loop_count', 'loopCount']),
      modified_file_count: modifiedFiles.length,
    },
    user_message: stallMessage,
    message: 'Subagent-summary observed completion; no automatic follow-up requested.',
  };

  trace({
    hook: 'subagent-summary',
    event: 'subagentStop',
    subagent_type: subagentType,
    status_field: status,
    modified_file_count: modifiedFiles.length,
    summary_excerpt: summary ? summary.slice(0, 120) : '',
    duration_ms: durationMs,
    stall_threshold_ms: STALL_THRESHOLD_MS,
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
