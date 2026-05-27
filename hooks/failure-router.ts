import * as fs from 'node:fs';
import * as process from 'node:process';
import { trace } from './_trace.ts';
import { extractToolName } from './_tool_payload.ts';

const FAILURE_TYPES = new Set([
  'transient',
  'fixable',
  'needs_replan',
  'escalate',
  'flaky',
  'regression',
]);

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

function main(): number {
  const payload = readPayload();
  if (payload?._invalid_json) {
    console.log(JSON.stringify({
      status: 'pass',
      fail_open: true,
      additional_context: '',
      message: 'Failure-router input was not JSON; skipped.'
    }));
    return 0;
  }

  const toolName = extractToolName(payload);

  let errorMessage = '';
  for (const key of ['error_message', 'errorMessage', 'message', 'error']) {
    const value = payload?.[key];
    if (typeof value === 'string' && value) {
      errorMessage = value;
      break;
    }
  }

  let failureType = '';
  for (const key of ['failure_type', 'failureType', 'type']) {
    const value = payload?.[key];
    if (typeof value === 'string' && value) {
      failureType = value;
      break;
    }
  }

  const parts = [
    `Tool failure observed.${toolName ? ` Tool: ${toolName}.` : ''}${failureType ? ` Failure type: ${failureType}.` : ''}`,
    'Route this failure through agents/debugger.md before retrying.',
    `Record the failure with cursor-state-bridge tools or \`node --experimental-strip-types scripts/workflow-state.ts\` using one of: ${[...FAILURE_TYPES].sort().join(', ')}.`,
  ];

  if (errorMessage) {
    const excerpt = errorMessage.trim().split(/\r?\n/)[0].slice(0, 200);
    parts.push(`First error line: ${excerpt}`);
  }

  const output = {
    status: 'pass',
    fail_open: true,
    additional_context: parts.join(' '),
    tool_name: toolName,
    failure_type: failureType,
    recommended_role: 'debugger',
  };

  trace({
    hook: 'failure-router',
    event: 'postToolUseFailure',
    tool_name: toolName,
    failure_type: failureType,
    error_excerpt: errorMessage.slice(0, 120),
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
