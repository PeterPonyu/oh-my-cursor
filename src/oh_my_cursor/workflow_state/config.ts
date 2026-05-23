import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

export interface ResolvedConfig {
  statePath: string;
  sessionCap: number;
  stepLimit: number;
  logDir: string;
}

export function resolveConfig(workspaceRoot: string): ResolvedConfig {
  const configPath = path.join(workspaceRoot, '.cursor', 'config.json');
  let configData: any = {};

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      configData = JSON.parse(raw) || {};
    }
  } catch {
    // Fail-open: ignore read/parse errors and fall back to env/defaults
  }

  // 1. statePath
  let statePath = process.env.OH_MY_CURSOR_WORKFLOW_STATE;
  if (!statePath && typeof configData.statePath === 'string' && configData.statePath.trim()) {
    statePath = configData.statePath.trim();
  }
  if (!statePath) {
    statePath = path.join(workspaceRoot, '.cursor', 'state', 'workflow-state.json');
  } else {
    if (statePath.startsWith('~')) {
      const homedir = process.env.HOME || '';
      statePath = path.join(homedir, statePath.slice(1));
    }
    if (!path.isAbsolute(statePath)) {
      statePath = path.resolve(workspaceRoot, statePath);
    }
  }

  // 2. sessionCap
  let sessionCap = 10;
  const envCap = process.env.OH_MY_CURSOR_SESSION_CAP;
  if (envCap) {
    const val = parseInt(envCap, 10);
    if (!isNaN(val) && val > 0) sessionCap = val;
  } else if (typeof configData.sessionCap === 'number' && configData.sessionCap > 0) {
    sessionCap = configData.sessionCap;
  }

  // 3. stepLimit
  let stepLimit = 5;
  const envLimit = process.env.OH_MY_CURSOR_STEP_LIMIT;
  if (envLimit) {
    const val = parseInt(envLimit, 10);
    if (!isNaN(val) && val > 0) stepLimit = val;
  } else if (typeof configData.stepLimit === 'number' && configData.stepLimit > 0) {
    stepLimit = configData.stepLimit;
  }

  // 4. logDir
  let logDir = process.env.OH_MY_CURSOR_LOG_DIR;
  if (!logDir && typeof configData.logDir === 'string' && configData.logDir.trim()) {
    logDir = configData.logDir.trim();
  }
  if (!logDir) {
    logDir = path.join(workspaceRoot, '.cursor-agent-logs');
  } else {
    if (logDir.startsWith('~')) {
      const homedir = process.env.HOME || '';
      logDir = path.join(homedir, logDir.slice(1));
    }
    if (!path.isAbsolute(logDir)) {
      logDir = path.resolve(workspaceRoot, logDir);
    }
  }

  return {
    statePath,
    sessionCap,
    stepLimit,
    logDir
  };
}
