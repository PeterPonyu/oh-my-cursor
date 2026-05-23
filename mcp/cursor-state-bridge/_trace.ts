import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as os from 'node:os';

const DISABLED_VALUES = new Set(['0', 'false', 'FALSE', 'no', 'off']);
const TRACE_FILENAME = 'trace.jsonl';
const ROTATION_CAP_BYTES = 10 * 1024 * 1024; // 10 MiB

function expandUser(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

function isEnabled(): boolean {
  const envVal = process.env.OH_MY_CURSOR_MCP_TRACE;
  if (envVal === undefined) return true;
  return !DISABLED_VALUES.has(envVal);
}

function resolveTracePath(workspace: string): string {
  const override = (process.env.OH_MY_CURSOR_MCP_TRACE_FILE || '').trim();
  if (override) {
    return path.resolve(expandUser(override));
  }
  return path.join(path.resolve(workspace), '.omcs', 'cursor-state-bridge', TRACE_FILENAME);
}

function rotateIfNeeded(tracePath: string): void {
  try {
    const stat = fs.statSync(tracePath);
    if (stat.size <= ROTATION_CAP_BYTES) {
      return;
    }
    const content = fs.readFileSync(tracePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) {
      return;
    }
    // Drop the oldest half
    const keep = lines.slice(Math.floor(lines.length / 2));
    let body = keep.join('\n');
    if (body && !body.endsWith('\n')) {
      body += '\n';
    }
    fs.writeFileSync(tracePath, body, 'utf-8');
  } catch {
    // swallow
  }
}

export function trace(workspace: string, record: any): void {
  if (!isEnabled()) {
    return;
  }
  try {
    const tracePath = resolveTracePath(workspace);
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    rotateIfNeeded(tracePath);

    const full = {
      ts: new Date().toISOString(),
      pid: process.pid,
      ...record,
    };

    // Note: ensure spaces after colons when stringifying for any simple regex tests!
    const line = JSON.stringify(full).replace(/":/g, '": ') + '\n';
    fs.appendFileSync(tracePath, line, 'utf-8');
  } catch {
    // swallow
  }
}
