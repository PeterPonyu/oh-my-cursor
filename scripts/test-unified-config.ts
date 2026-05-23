import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from '../src/oh_my_cursor/workflow_state/index.ts';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const CONFIG_PATH = path.join(ROOT, '.cursor', 'config.json');

let originalConfig: string | null = null;

function setup() {
  if (fs.existsSync(CONFIG_PATH)) {
    originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
    fs.unlinkSync(CONFIG_PATH);
  }
}

function restore() {
  if (originalConfig !== null) {
    fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
  } else if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  // Clear config-specific environment variables
  delete process.env.OH_MY_CURSOR_WORKFLOW_STATE;
  delete process.env.OH_MY_CURSOR_SESSION_CAP;
  delete process.env.OH_MY_CURSOR_STEP_LIMIT;
  delete process.env.OH_MY_CURSOR_LOG_DIR;
}

try {
  console.log('Running Unified Configuration tests...');
  setup();

  // Test 1: Fallback Defaults (no file, no env)
  const config1 = resolveConfig(ROOT);
  console.log('Test 1 (Defaults): statePath =', config1.statePath);
  console.log('Test 1 (Defaults): stepLimit =', config1.stepLimit);
  if (!config1.statePath.endsWith('.cursor/state/workflow-state.json') || config1.stepLimit !== 5) {
    throw new Error('Test 1 failed: incorrect default values resolved.');
  }

  // Test 2: File overrides
  const mockConfig = {
    statePath: 'custom-state.json',
    sessionCap: 25,
    stepLimit: 12,
    logDir: 'custom-logs'
  };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(mockConfig), 'utf-8');

  const config2 = resolveConfig(ROOT);
  console.log('Test 2 (File): statePath =', config2.statePath);
  console.log('Test 2 (File): stepLimit =', config2.stepLimit);
  if (!config2.statePath.endsWith('custom-state.json') || config2.sessionCap !== 25 || config2.stepLimit !== 12 || !config2.logDir.endsWith('custom-logs')) {
    throw new Error('Test 2 failed: config properties not read from .cursor/config.json');
  }

  // Test 3: Environment overrides
  process.env.OH_MY_CURSOR_WORKFLOW_STATE = 'env-state.json';
  process.env.OH_MY_CURSOR_STEP_LIMIT = '99';

  const config3 = resolveConfig(ROOT);
  console.log('Test 3 (Env Override): statePath =', config3.statePath);
  console.log('Test 3 (Env Override): stepLimit =', config3.stepLimit);
  if (!config3.statePath.endsWith('env-state.json') || config3.stepLimit !== 99) {
    throw new Error('Test 3 failed: environment variables did not override config file settings');
  }

  console.log('All Unified Configuration tests passed successfully!');
} finally {
  restore();
}
