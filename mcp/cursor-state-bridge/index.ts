import * as process from 'node:process';
import { Server } from './server.ts';

function buildParser() {
  const args = process.argv.slice(2);
  const result: any = { workspace: '', taskId: '' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace') {
      result.workspace = args[i + 1];
      i++;
    } else if (args[i] === '--task-id') {
      result.taskId = args[i + 1];
      i++;
    }
  }
  return result;
}

function main() {
  const params = buildParser();
  if (!params.workspace) {
    console.error('Error: --workspace is required');
    process.exit(1);
  }
  const server = new Server(params.workspace, params.taskId);
  server.serve();
}

try {
  main();
} catch (err: any) {
  process.stderr.write(`cursor-state-bridge: fatal: ${err.message || err}\n`);
  process.exit(1);
}
