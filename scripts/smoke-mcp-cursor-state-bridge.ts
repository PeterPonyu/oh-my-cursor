import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

if (process.env.RUN_MCP_BRIDGE_SMOKE !== '1') {
  console.log('bounded: smoke gated by RUN_MCP_BRIDGE_SMOKE=1');
  process.exit(0);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function spawnBridge(workspace: string, extraArgs: string[] = []): any {
  const bridgeScript = path.join(workspace, 'mcp', 'cursor-state-bridge', 'index.ts');
  const args = ['--experimental-strip-types', bridgeScript, '--workspace', workspace, ...extraArgs];
  const proc = spawn('node', args, { stdio: ['pipe', 'pipe', 'inherit'] });
  return proc;
}

function spawnBridgeFromCmd(command: string, args: string[], workspace: string): any {
  const resolvedArgs = args.map(a => a.replace(/\$\{workspaceFolder\}/g, workspace));
  const proc = spawn(command, resolvedArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
  return proc;
}

function sendRecv(proc: any, req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: proc.stdout, terminal: false });
    rl.once('line', (line) => {
      try {
        resolve(JSON.parse(line.trim()));
      } catch (err: any) {
        reject(new Error(`Failed to parse line: ${line}`));
      }
    });
    proc.stdin.write(JSON.stringify(req) + '\n');
  });
}

const INIT_REQ = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
const TOOLS_LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

async function runFull() {
  const proc = spawnBridge(ROOT);
  try {
    const r1 = await sendRecv(proc, INIT_REQ);
    if (!r1.result) fail(`initialize failed: ${JSON.stringify(r1)}`);
    const r2 = await sendRecv(proc, TOOLS_LIST);
    if (!r2.result) fail(`tools/list failed: ${JSON.stringify(r2)}`);
    const tools = r2.result.tools || [];
    if (tools.length !== 11) {
      fail(`expected 11 tools, got ${tools.length}: ${JSON.stringify(tools.map((t: any) => t.name))}`);
    }
    console.log(`tools=${tools.length}`);
  } finally {
    proc.stdin.end();
  }
}

async function runJailEscape() {
  const proc = spawnBridge(ROOT);
  try {
    await sendRecv(proc, INIT_REQ);
    const evil = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'state_read', arguments: { task_id: '../../etc/passwd' } }
    };
    const r = await sendRecv(proc, evil);
    if (!r.error) fail(`expected error response, got: ${JSON.stringify(r)}`);
    const code = r.error.code;
    if (code !== -32602) fail(`expected code -32602, got ${code}`);
    console.log(`jail-escape: rejected (${code})`);
  } finally {
    proc.stdin.end();
  }
}

async function runAuthDefault() {
  if ((process.env.OH_MY_CURSOR_MCP_TOKEN || '').trim()) {
    fail('auth-default mode requires OH_MY_CURSOR_MCP_TOKEN unset');
  }
  const proc = spawnBridge(ROOT);
  try {
    const r = await sendRecv(proc, INIT_REQ);
    if (!r.result) fail(`default-OFF initialize failed: ${JSON.stringify(r)}`);
    console.log('auth: default OFF, initialize ok');
  } finally {
    proc.stdin.end();
  }
}

async function runAuthEnforced() {
  const token = (process.env.OH_MY_CURSOR_MCP_TOKEN || '').trim();
  if (!token) {
    fail('auth-enforced mode requires OH_MY_CURSOR_MCP_TOKEN to be exported');
  }
  const proc = spawnBridge(ROOT);
  try {
    const r1 = await sendRecv(proc, INIT_REQ);
    if (!r1.error) fail(`expected -32001 unauthorized, got: ${JSON.stringify(r1)}`);
    if (r1.error.code !== -32001) fail(`expected -32001, got ${JSON.stringify(r1.error)}`);
    console.log('auth-enforced: missing token rejected (-32001)');
  } finally {
    proc.stdin.end();
  }

  const proc2 = spawnBridge(ROOT);
  try {
    const good = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { token } };
    const r2 = await sendRecv(proc2, good);
    if (!r2.result) fail(`matching-token initialize failed: ${JSON.stringify(r2)}`);
    console.log('auth-enforced: matching token accepted');
  } finally {
    proc2.stdin.end();
  }
}

async function runFromExample() {
  const examplePath = path.join(ROOT, '.cursor', 'mcp.example.json');
  const data = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
  const servers = data.mcpServers || {};
  const srvName = Object.keys(servers)[0];
  if (!srvName) {
    throw new Error('mcp.example.json has no mcpServers');
  }
  const srv = servers[srvName];
  const command = srv.command;
  const args = srv.args || [];
  const proc = spawnBridgeFromCmd(command, args, ROOT);
  try {
    const r1 = await sendRecv(proc, INIT_REQ);
    if (!r1.result) fail(`initialize failed: ${JSON.stringify(r1)}`);
    console.log('from-example: ok');
  } finally {
    proc.stdin.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  let mode = 'full';
  if (args.includes('--jail-escape')) mode = 'jail-escape';
  else if (args.includes('--from-example')) mode = 'from-example';
  else if (args.includes('--auth')) mode = 'auth-default';
  else if (args.includes('--auth-enforced')) mode = 'auth-enforced';

  try {
    if (mode === 'full') await runFull();
    else if (mode === 'jail-escape') await runJailEscape();
    else if (mode === 'auth-default') await runAuthDefault();
    else if (mode === 'auth-enforced') await runAuthEnforced();
    else if (mode === 'from-example') await runFromExample();
    console.log('MCP_BRIDGE_SMOKE_OK');
  } catch (err: any) {
    fail(err.message || err);
  }
}

main();
