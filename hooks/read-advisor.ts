import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { trace } from './_trace.ts';

const STATE_BASENAMES = new Set([
  'workflow-state.json',
  'workflow-state.example.json',
  'workflow-state.schema.json',
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
      permission: 'allow',
      user_message: 'Read-advisor input was not JSON; skipped.'
    }));
    return 0;
  }

  let filePath = '';
  for (const key of ['file_path', 'filePath', 'path']) {
    const value = payload?.[key];
    if (typeof value === 'string' && value) {
      filePath = value;
      break;
    }
  }

  const basename = filePath ? path.posix.basename(filePath.replace(/\\/g, '/')) : '';

  let userMessage = '';
  let status = 'pass';

  if (STATE_BASENAMES.has(basename)) {
    userMessage = (
      'Read-advisor: this is a workflow-state document under .cursor/state/. ' +
      'It is human-visible, schema-bounded (.cursor/state/workflow-state.schema.json), ' +
      'and only edited through cursor-state-bridge tools or the workflow-state CLI.'
    );
    status = 'advised';
  }

  const output = {
    status,
    fail_open: true,
    permission: 'allow',
    user_message: userMessage,
    file_path: filePath,
  };

  trace({
    hook: 'read-advisor',
    event: 'beforeReadFile',
    status,
    file_basename: basename,
    is_state_file: STATE_BASENAMES.has(basename),
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
