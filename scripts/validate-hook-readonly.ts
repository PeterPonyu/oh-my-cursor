import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const HOOKS_DIR = path.join(ROOT, 'hooks');
const STATE_DIR = path.join(ROOT, '.cursor', 'state');
const BRIDGE_DIR = path.join(ROOT, 'mcp', 'cursor-state-bridge');
const SRC_DIR = path.join(ROOT, 'src');

const STATE_PATH_RE = /\.cursor\/state\/workflow-state[^/]*/;
const WRITE_METHODS = /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|openSync|open)\b/;

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`ok: ${message}`);
}

function scanFile(filePath: string): string[] {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);
    const lines = text.split(/\r?\n/);
    const offenders: string[] = [];

    for (let lineNo = 1; lineNo <= lines.length; lineNo++) {
      const line = lines[lineNo - 1];
      if (STATE_PATH_RE.test(line) && WRITE_METHODS.test(line)) {
        offenders.push(`${filename}:${lineNo} write call targets state document path`);
      }
    }
    return offenders;
  } catch (exc: any) {
    return [`${path.basename(filePath)}: read error: ${exc.message || exc}`];
  }
}

function hookFiles(): string[] {
  if (!fs.existsSync(HOOKS_DIR) || !fs.statSync(HOOKS_DIR).isDirectory()) {
    fail(`hooks directory missing: ${HOOKS_DIR}`);
  }
  return fs.readdirSync(HOOKS_DIR)
    .filter(f => f.endsWith('.ts') && f !== '_trace.ts')
    .map(f => path.join(HOOKS_DIR, f))
    .sort();
}

function runDefaultScan(): number {
  const files = hookFiles();
  const offenders: string[] = [];
  for (const file of files) {
    offenders.push(...scanFile(file));
  }

  if (offenders.length > 0) {
    console.error('FAIL: hook read-only contract violated:');
    for (const line of offenders) {
      console.error(`  ${line}`);
    }
    process.exit(1);
  }

  ok(`scanned ${files.length} hook files; none write to .cursor/state/workflow-state*.json`);
  console.log('HOOK_READONLY_OK');
  return 0;
}

async function runCheckSharedLock(): Promise<number> {
  const workflowApiPath = path.join(SRC_DIR, 'oh_my_cursor', 'workflow_state', 'api.ts');
  const canonicalLockingPath = path.join(SRC_DIR, 'oh_my_cursor', 'workflow_state', 'locking.ts');
  const workflowShimPath = path.join(STATE_DIR, 'workflow-state.ts');
  const lockingShimPath = path.join(STATE_DIR, '_locking.ts');

  if (!fs.existsSync(STATE_DIR)) fail(`state directory missing: ${STATE_DIR}`);
  if (!fs.existsSync(workflowApiPath)) fail(`workflow-state API missing: ${workflowApiPath}`);
  if (!fs.existsSync(canonicalLockingPath)) fail(`canonical lock missing: ${canonicalLockingPath}`);
  if (!fs.existsSync(workflowShimPath)) fail(`workflow-state compatibility shim missing: ${workflowShimPath}`);
  if (!fs.existsSync(lockingShimPath)) fail(`locking compatibility shim missing: ${lockingShimPath}`);

  try {
    // Dynamically import TS modules using Node ESM capabilities
    const workflowApi = await import(workflowApiPath);
    const workflowLocking = await import(canonicalLockingPath);
    const lockingShim = await import(lockingShimPath);
    const workflowShim = await import(workflowShimPath);

    if (workflowApi.fileLock !== workflowLocking.fileLock) {
      fail('API and locking do not share fileLock');
    }

    if (lockingShim.fileLock !== workflowLocking.fileLock) {
      fail('.cursor/state/_locking.ts does not re-export canonical fileLock');
    }

    if (workflowShim.init_state !== workflowApi.initState) {
      fail('.cursor/state/workflow-state.ts does not re-export canonical initState');
    }

    if (workflowShim.file_lock !== workflowLocking.fileLock) {
      fail('.cursor/state/workflow-state.ts does not re-export canonical fileLock');
    }
  } catch (err: any) {
    fail(`Shim checks failed: ${err.message || err}`);
  }

  // Check no module under .cursor/state/ imports from mcp/
  const forbiddenImport = /^\s*from\s+mcp[._/]|^\s*import\s+mcp\b|import\s+.*from\s+['"]mcp/m;
  const forbidden: string[] = [];
  const stateFiles = fs.readdirSync(STATE_DIR).filter(f => f.endsWith('.ts'));
  for (const file of stateFiles) {
    const text = fs.readFileSync(path.join(STATE_DIR, file), 'utf-8');
    if (forbiddenImport.test(text)) {
      forbidden.push(path.join('.cursor', 'state', file));
    }
  }
  if (forbidden.length > 0) {
    fail(`.cursor/state/ modules import from mcp/: ${forbidden.join(', ')}; the dependency direction must be package/bridge/hooks -> workflow-state, never reverse`);
  }

  const duplicatePy = path.join(BRIDGE_DIR, '_locking.py');
  const duplicateTs = path.join(BRIDGE_DIR, '_locking.ts');
  if (fs.existsSync(duplicatePy) || fs.existsSync(duplicateTs)) {
    fail(`bridge ships a duplicate locking helper; the lock primitive must live only at src/oh_my_cursor/workflow_state/locking.ts`);
  }

  ok(`canonical lock sourced from ${path.relative(ROOT, canonicalLockingPath)}`);
  ok('.cursor/state/ compatibility shims re-export the packaged API/lock');
  ok('.cursor/state/ modules do not import from mcp/');
  ok('bridge does not ship a duplicate locking helper');
  console.log('HOOK_READONLY_SHARED_LOCK_OK');
  return 0;
}

function runSelfTest(): number {
  const tempDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'omcs-self-test-'));
  try {
    const offender = path.join(tempDir, '_evil.ts');
    fs.writeFileSync(offender, `
      import * as fs from 'node:fs';
      fs.writeFileSync('.cursor/state/workflow-state.json', '{}');
    `, 'utf-8');

    const traceFile = path.join(tempDir, '_trace.ts');
    fs.writeFileSync(traceFile, `
      import * as fs from 'node:fs';
      fs.writeFileSync('.omcs/hook-trace.log', '{}');
    `, 'utf-8');

    const offenderResults = scanFile(offender);
    if (offenderResults.length === 0) {
      fail('self-test offender not detected; regex scan is broken');
    }
    ok(`self-test offender detected: ${offenderResults[0]}`);

    const traceResults = scanFile(traceFile);
    if (traceResults.length > 0) {
      fail(`self-test allowlist failed: a write to .omcs/hook-trace.log was reported as a state-file write -- ${traceResults.join(', ')}`);
    }
    ok('self-test allowlist: write to .omcs/hook-trace.log NOT flagged');
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  console.log('HOOK_READONLY_SELF_TEST_OK');
  return 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    return runSelfTest();
  }
  if (args.includes('--check-shared-lock')) {
    return await runCheckSharedLock();
  }
  return runDefaultScan();
}

main().then(code => process.exit(code));
