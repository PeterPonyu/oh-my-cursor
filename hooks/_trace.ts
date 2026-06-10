import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveRepoRoot } from './_repo.ts';

const TRUE_VALUES = new Set(['1', 'true', 'TRUE', 'yes', 'on']);

function isEnabled(): boolean {
  return TRUE_VALUES.has(process.env.OH_MY_CURSOR_HOOK_TRACE || '');
}

function resolveLogPath(): string {
  const override = (process.env.OH_MY_CURSOR_HOOK_TRACE_FILE || '').trim();
  if (override) {
    return path.resolve(override);
  }
  const currentFile = fileURLToPath(import.meta.url);
  const repoRoot = resolveRepoRoot(currentFile);
  return path.join(repoRoot, '.omcs', 'hook-trace.log');
}

export function trace(record: Record<string, any>): void {
  if (!isEnabled()) {
    return;
  }
  try {
    const target = resolveLogPath();
    const parentDir = path.dirname(target);
    fs.mkdirSync(parentDir, { recursive: true });

    const full = {
      ts: new Date().toISOString(),
      pid: process.pid,
      ...record,
    };
    fs.appendFileSync(target, JSON.stringify(full) + '\n', 'utf-8');
  } catch (err: any) {
    // Fail-silent by default; emit a warning when OMCS_TRACE_DEBUG=1 for observability
    if (process.env.OMCS_TRACE_DEBUG === '1') {
      process.stderr.write(`[omcs:trace] warn: failed to write trace log: ${err?.message ?? err}\n`);
    }
  }
}
