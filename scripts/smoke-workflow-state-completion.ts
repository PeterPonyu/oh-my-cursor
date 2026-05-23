import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function runNode(scriptPath: string, args: string[], env: any, stdinText?: string): string {
  const absPath = path.resolve(ROOT, scriptPath);
  try {
    const input = stdinText !== undefined ? stdinText : '';
    // Format command carefully
    const cmd = `node --experimental-strip-types "${absPath}" ${args.join(' ')}`;
    return execSync(cmd, {
      input,
      env: { ...process.env, ...env },
      encoding: 'utf-8',
    });
  } catch (err: any) {
    fail(`Failed running ${scriptPath}: ${err.stdout || err.stderr || err.message}`);
  }
}

function main() {
  const tempDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'omcs-completion-smoke-'));
  const statePath = path.join(tempDir, 'workflow-state.json');

  try {
    runNode('scripts/workflow-state.ts', [
      'init',
      `"${statePath}"`,
      '--task-id', 'omcs-completion-smoke',
      '--title', '"workflow-state completion smoke"',
      '--phase', 'verify',
      '--status', 'in_progress',
      '--role', 'qa-tester',
      '--next-action', '"collect runtime evidence"'
    ], {});

    runNode('scripts/workflow-state.ts', [
      'ac',
      `"${statePath}"`,
      '--id', 'AC-001',
      '--criterion', '"state watcher reports direct workflow-state validation"',
      '--status', 'passed',
      '--evidence', 'scripts/smoke-workflow-state-completion.sh:state-watcher'
    ], {});

    runNode('scripts/workflow-state.ts', [
      'ac',
      `"${statePath}"`,
      '--id', 'AC-002',
      '--criterion', '"compact and stop hooks surface pending criteria"',
      '--status', 'pending'
    ], {});

    runNode('scripts/workflow-state.ts', [
      'history',
      `"${statePath}"`,
      '--note', '"qa-tester collected partial smoke evidence"'
    ], {});

    runNode('scripts/validate-workflow-state.ts', [`"${statePath}"`], {});

    const watcherInput = JSON.stringify({
      tool_name: 'Edit',
      file_path: statePath,
      tool_input: { file_path: statePath }
    });
    const watcherOutput = runNode('hooks/state-watcher.ts', [], { OH_MY_CURSOR_WORKSPACE: ROOT }, watcherInput);
    if (!watcherOutput.includes('"checked": true')) {
      fail(`state-watcher did not validate direct workflow-state edit: ${watcherOutput}`);
    }
    if (!watcherOutput.includes('matches .cursor/state/workflow-state.schema.json')) {
      fail(`state-watcher did not report schema match: ${watcherOutput}`);
    }

    const compactOutput = runNode('hooks/compact-reminder.ts', [], {
      OH_MY_CURSOR_WORKSPACE: ROOT,
      OH_MY_CURSOR_WORKFLOW_STATE: statePath
    }, JSON.stringify({ trigger: 'manual-smoke' }));
    if (!compactOutput.includes('AC-002')) {
      fail(`compact-reminder did not surface pending acceptance criterion: ${compactOutput}`);
    }

    const stopOutput = runNode('hooks/stop-gate.ts', [], {
      OH_MY_CURSOR_WORKSPACE: ROOT,
      OH_MY_CURSOR_WORKFLOW_STATE: statePath
    }, JSON.stringify({ status: 'passed', loop_count: 0 }));
    if (!stopOutput.includes('AC-002')) {
      fail(`stop-gate did not surface pending acceptance criterion: ${stopOutput}`);
    }

    const workspaceRoot = path.join(tempDir, 'workspace');
    const workspaceState = path.join(workspaceRoot, '.cursor', 'state', 'workflow-state.json');
    fs.mkdirSync(path.dirname(workspaceState), { recursive: true });
    fs.copyFileSync(statePath, workspaceState);

    const workspaceStopOutput = runNode('hooks/stop-gate.ts', [], {
      OH_MY_CURSOR_WORKSPACE: workspaceRoot
    }, JSON.stringify({ status: 'passed', loop_count: 0 }));
    if (!workspaceStopOutput.includes('AC-002')) {
      fail(`stop-gate did not read workspace default workflow-state: ${workspaceStopOutput}`);
    }

    runNode('scripts/workflow-state.ts', [
      'ac',
      `"${statePath}"`,
      '--id', 'AC-002',
      '--criterion', '"compact and stop hooks surface pending criteria"',
      '--status', 'passed',
      '--evidence', 'scripts/smoke-workflow-state-completion.sh:stop-gate'
    ], {});

    runNode('scripts/workflow-state.ts', [
      'set',
      `"${statePath}"`,
      '--phase', 'done',
      '--status', 'passed',
      '--role', 'verifier',
      '--next-action', '"stop session"',
      '--note', '"completion smoke passed"'
    ], {});

    runNode('scripts/validate-workflow-state.ts', [`"${statePath}"`], {});

    const finalStopOutput = runNode('hooks/stop-gate.ts', [], {
      OH_MY_CURSOR_WORKSPACE: ROOT,
      OH_MY_CURSOR_WORKFLOW_STATE: statePath
    }, JSON.stringify({ status: 'passed', loop_count: 0 }));
    if (finalStopOutput.includes('pending acceptance criteria')) {
      fail(`stop-gate reported pending criteria after completion: ${finalStopOutput}`);
    }

    console.log('WORKFLOW_STATE_COMPLETION_SMOKE_OK');
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

main();
