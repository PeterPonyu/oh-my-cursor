import * as fs from 'node:fs';
import * as process from 'node:process';
import { trace } from './_trace.ts';

const PROOF_PATTERNS: Array<[RegExp, string]> = [
  [/\bscripts\/validate-([A-Za-z0-9_-]+)\.(?:py|sh|ts)\b/, 'validator'],
  [/\bscripts\/smoke-([A-Za-z0-9_-]+)\.sh\b/, 'smoke'],
  [/\bscripts\/check-([A-Za-z0-9_-]+)\.sh\b/, 'check'],
  [/\bscripts\/verify-([A-Za-z0-9_-]+)\.sh\b/, 'verify'],
  [/\bscripts\/install-local-plugin\.sh\b/, 'installer'],
  [/\bscripts\/workflow-state\.py\b/, 'state-writer'],
  [/\bscripts\/workflow-state\.ts\b/, 'state-writer'],
];

const PROOF_CLASS: Record<string, string> = {
  validator: 'checked-in-artifact',
  smoke: 'checked-in-artifact',
  check: 'checked-in-artifact',
  verify: 'checked-in-artifact',
  installer: 'checked-in-artifact',
  'state-writer': 'checked-in-artifact',
};

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
      message: 'Shell-debrief input was not JSON; skipped.'
    }));
    return 0;
  }

  let command = '';
  for (const key of ['command', 'commandLine', 'command_line', 'cmd']) {
    const value = payload?.[key];
    if (typeof value === 'string' && value) {
      command = value;
      break;
    }
  }

  const matches: Array<{ kind: string; match: string; proof_class: string }> = [];
  for (const [pattern, kind] of PROOF_PATTERNS) {
    const match = command.match(pattern);
    if (match) {
      matches.push({
        kind,
        match: match[0],
        proof_class: PROOF_CLASS[kind] || '',
      });
    }
  }

  let additionalContext = '';
  let status = 'pass';

  if (matches.length > 0) {
    const labels = matches.map(item => `${item.kind}=${item.match}`).join(', ');
    additionalContext = (
      'Shell-debrief noticed a repo-owned proof command in this run: ' +
      labels +
      '. Treat its output as checked-in-artifact evidence when updating acceptance criteria.'
    );
    status = 'matched';
  }

  const output = {
    status,
    fail_open: true,
    additional_context: additionalContext,
    command_excerpt: command.slice(0, 200),
    matches,
  };

  trace({
    hook: 'shell-debrief',
    event: 'afterShellExecution',
    status,
    command_excerpt: command.slice(0, 120),
    match_count: matches.length,
    match_kinds: matches.map(item => item.kind),
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
