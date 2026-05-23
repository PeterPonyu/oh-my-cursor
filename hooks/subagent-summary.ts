import * as fs from 'node:fs';
import * as process from 'node:process';
import { trace } from './_trace.ts';
import { clearActiveRole } from './_active_role.ts';

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
    status: 'pass',
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
    message: 'Subagent-summary observed completion; no automatic follow-up requested.',
  };

  trace({
    hook: 'subagent-summary',
    event: 'subagentStop',
    subagent_type: subagentType,
    status_field: status,
    modified_file_count: modifiedFiles.length,
    summary_excerpt: summary ? summary.slice(0, 120) : '',
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
