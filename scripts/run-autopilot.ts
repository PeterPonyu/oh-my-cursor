import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { execSync, execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fileLock, resolveConfig } from '../src/oh_my_cursor/workflow_state/index.ts';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

interface Task {
  id: string;
  status: string;
  role: string;
  prompt: string;
  dependencies?: string[];
  verification_command?: string;
  rollback_plan?: string;
}

function usage() {
  console.log(`Usage: node --experimental-strip-types scripts/run-autopilot.ts [--state PATH] [--step-limit N]

Runs the Bounded Autopilot loop:
  - Enforces step limits (default: 5)
  - Intercepts cancel token file (.omcs/cancel) and SIGINT
  - Validates plan phase via consensus-gate.ts before executing
  - Runs tasks sequentially, executes verification commands, and tracks state`);
}

function getWorkflowState(filePath: string): any {
  return fileLock(filePath, () => {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  });
}

function updateTaskStatus(filePath: string, taskId: string, status: string, note?: string) {
  fileLock(filePath, () => {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.tasks) data.tasks = [];
    const task = data.tasks.find((t: any) => t.id === taskId);
    if (task) {
      task.status = status;
    }
    if (note) {
      if (!data.history) data.history = [];
      data.history.push({
        phase: data.phase || 'execute',
        status: data.status || 'in_progress',
        note,
        at: new Date().toISOString().split('T')[0]
      });
    }

    const dir = path.dirname(filePath);
    const tmpName = path.join(
      dir,
      `.${path.basename(filePath)}.${Math.random().toString(36).slice(2)}.${process.pid}.tmp`
    );
    fs.writeFileSync(tmpName, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmpName, filePath);
  });
}

function updateWorkflowStatus(filePath: string, phase: string, status: string, note?: string) {
  fileLock(filePath, () => {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    data.phase = phase;
    data.status = status;
    if (note) {
      if (!data.history) data.history = [];
      data.history.push({
        phase,
        status,
        note,
        at: new Date().toISOString().split('T')[0]
      });
    }

    const dir = path.dirname(filePath);
    const tmpName = path.join(
      dir,
      `.${path.basename(filePath)}.${Math.random().toString(36).slice(2)}.${process.pid}.tmp`
    );
    fs.writeFileSync(tmpName, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmpName, filePath);
  });
}

/**
 * Parse a shell-style command string into [executable, ...args] without
 * spawning a shell. Supports single/double-quoted tokens and backslash
 * escaping but deliberately rejects operators (|, &, ;, >, <, `) that
 * would only make sense in a shell context.
 * Returns null if the string contains shell operators or is otherwise unsafe.
 */
export function _parseArgv(cmd: string): string[] | null {
  // Reject shell metacharacters that have no safe argv equivalent
  if (/[|&;<>$`]/.test(cmd)) {
    return null;
  }
  const tokens: string[] = [];
  let current = '';
  let i = 0;
  while (i < cmd.length) {
    const ch = cmd[i];
    if (ch === '\\') {
      i++;
      if (i < cmd.length) current += cmd[i++];
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < cmd.length && cmd[i] !== '"') {
        if (cmd[i] === '\\' && i + 1 < cmd.length) { i++; current += cmd[i++]; }
        else { current += cmd[i++]; }
      }
      i++; // closing "
      continue;
    }
    if (ch === "'") {
      i++;
      while (i < cmd.length && cmd[i] !== "'") { current += cmd[i++]; }
      i++; // closing '
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (current.length > 0) { tokens.push(current); current = ''; }
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.length > 0) tokens.push(current);
  return tokens.length > 0 ? tokens : null;
}

function executeRollback(task: Task, statePath: string, phase: string) {
  if (task.rollback_plan) {
    console.log(`ok: Initiating rollback plan for task ${task.id}: ${task.rollback_plan}`);
    const logDir = resolveConfig(ROOT).logDir;
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `rollback-${task.id}.log`);

    const argv = _parseArgv(task.rollback_plan);
    if (!argv) {
      const msg = `Rollback plan for task ${task.id} contains shell operators and was rejected for safety: ${task.rollback_plan}`;
      fs.writeFileSync(logFile, msg, 'utf-8');
      console.error(`FAIL: ${msg}`);
      updateWorkflowStatus(statePath, phase, 'blocked', `Task ${task.id} failed. Rollback rejected (shell operators): ${task.rollback_plan}`);
      return;
    }

    try {
      const output = execFileSync(argv[0], argv.slice(1), { cwd: ROOT, encoding: 'utf-8' });
      fs.writeFileSync(logFile, output, 'utf-8');
      console.log(`ok: Rollback completed successfully for task ${task.id}. Logs written to ${logFile}`);

      updateWorkflowStatus(
        statePath,
        phase,
        'blocked',
        `Task ${task.id} failed. Executed rollback plan: ${task.rollback_plan}`
      );
    } catch (err: any) {
      const errorMsg = err.stdout || err.message || String(err);
      fs.writeFileSync(logFile, errorMsg, 'utf-8');
      console.error(`FAIL: Rollback command failed for task ${task.id}: ${err.message}`);

      updateWorkflowStatus(
        statePath,
        phase,
        'blocked',
        `Task ${task.id} failed. Rollback execution failed: ${task.rollback_plan}`
      );
    }
  } else {
    updateWorkflowStatus(statePath, phase, 'blocked', `Task ${task.id} failed.`);
  }
}

function checkCancelToken(): boolean {
  const cancelDir = path.join(ROOT, '.omcs');
  const cancelFile = path.join(cancelDir, 'cancel');
  if (fs.existsSync(cancelFile)) {
    try {
      fs.unlinkSync(cancelFile);
    } catch {}
    return true;
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const config = resolveConfig(ROOT);
  let statePath = '';
  let stepLimit = NaN;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--state') {
      if (i + 1 >= args.length) {
        console.error('FAIL: --state requires a path');
        process.exit(1);
      }
      statePath = args[++i];
    } else if (arg === '--step-limit') {
      if (i + 1 >= args.length) {
        console.error('FAIL: --step-limit requires an integer');
        process.exit(1);
      }
      stepLimit = parseInt(args[++i], 10);
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      console.error(`FAIL: unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!statePath) {
    statePath = config.statePath;
  } else {
    if (statePath.startsWith('~')) {
      const homedir = process.env.HOME || '';
      statePath = path.join(homedir, statePath.slice(1));
    }
    if (!path.isAbsolute(statePath)) {
      statePath = path.resolve(ROOT, statePath);
    }
  }

  if (isNaN(stepLimit)) {
    stepLimit = config.stepLimit;
  }

  if (!fs.existsSync(statePath)) {
    console.error(`FAIL: Workflow state file not found: ${statePath}`);
    process.exit(1);
  }

  // Handle SIGINT cleanly
  process.on('SIGINT', () => {
    console.log('\nok: Autopilot suspended via SIGINT.');
    process.exit(0);
  });

  console.log(`ok: Autopilot starting. State: ${statePath}, Step Limit: ${stepLimit}`);

  let model = (process.env.CURSOR_SMOKE_MODEL || '').trim();
  if (!model) {
    try {
      model = execSync('node --experimental-strip-types scripts/resolve-cursor-model.ts', { cwd: ROOT, encoding: 'utf-8' }).trim();
    } catch {
      model = 'auto';
    }
  }
  console.log(`ok: Using model: ${model}`);

  const logDir = config.logDir;
  fs.mkdirSync(logDir, { recursive: true });

  let steps = 0;

  while (steps < stepLimit) {
    // 1. Check Cancel Token
    if (checkCancelToken()) {
      console.log('ok: Autopilot execution cancelled by user request file.');
      updateWorkflowStatus(statePath, getWorkflowState(statePath).phase, 'in_progress', 'Autopilot execution cancelled by user');
      process.exit(0);
    }

    const state = getWorkflowState(statePath);
    if (!state) {
      console.error('FAIL: Could not read workflow state.');
      process.exit(1);
    }

    const phase = state.phase || 'intake';
    const status = state.status || 'in_progress';

    // 2. Terminal loop check
    if (phase === 'done' || phase === 'failed' || status === 'failed' || status === 'blocked') {
      console.log(`ok: Autopilot loop ended. Phase: ${phase}, Status: ${status}`);
      break;
    }

    // 3. Consensus Planning Gate check
    if (phase === 'plan' && status === 'in_progress') {
      console.log('ok: Running Consensus Planning Gate check...');
      try {
        execSync(`node --experimental-strip-types scripts/consensus-gate.ts --state "${statePath}"`, { cwd: ROOT, stdio: 'inherit' });
        console.log('ok: Consensus Gate passed. Advancing to execute phase.');
        updateWorkflowStatus(statePath, 'execute', 'in_progress', 'Consensus reached. Advancing to execute phase.');
        continue;
      } catch {
        console.error('FAIL: Consensus Planning Gate check failed. Suspending Autopilot.');
        updateWorkflowStatus(statePath, 'plan', 'blocked', 'Consensus Planning Gate failed');
        process.exit(1);
      }
    }

    // 4. Determine next step/task
    const tasks: Task[] = state.tasks || [];
    const unfinishedTasks = tasks.filter(t => !['completed', 'passed', 'skipped', 'failed', 'blocked'].includes(t.status));

    if (unfinishedTasks.length > 0) {
      // Find next task whose dependencies are satisfied
      const nextTask = unfinishedTasks.find(t => {
        if (t.dependencies && t.dependencies.length > 0) {
          return t.dependencies.every(depId => {
            const dep = tasks.find(x => x.id === depId);
            return dep && ['completed', 'passed', 'skipped'].includes(dep.status);
          });
        }
        return true;
      });

      if (!nextTask) {
        console.error('FAIL: Deadlock detected in tasks dependencies. Suspending.');
        updateWorkflowStatus(statePath, phase, 'blocked', 'Dependency deadlock detected in tasks');
        process.exit(1);
      }

      console.log(`ok: [Step ${steps + 1}/${stepLimit}] Spawning agent for task ${nextTask.id} (${nextTask.role})`);
      updateTaskStatus(statePath, nextTask.id, 'in_progress', `Autopilot started task ${nextTask.id}`);

      const logFile = path.join(logDir, `task-${nextTask.id}.log`);
      const outStream = fs.createWriteStream(logFile);
      const prompt = `You are acting as the specialized '${nextTask.role}' agent. Perform the following task: ${nextTask.prompt}`;

      const code = await new Promise<number>((resolve) => {
        if (process.env.OH_MY_CURSOR_MOCK_AGENT === '1') {
          console.log(`ok: Mock agent execution for task ${nextTask.id}`);
          setTimeout(() => {
            resolve(0);
          }, 50);
          return;
        }

        const child = spawn('cursor-agent', [
          '-p',
          '--output-format', 'text',
          '--model', model,
          '--mode', 'ask',
          '--trust',
          '--workspace', ROOT,
          prompt
        ]);

        child.stdout.pipe(outStream);
        child.stderr.pipe(outStream);

        child.on('close', (code) => {
          outStream.close();
          resolve(code ?? 1);
        });
      });

      steps++;

      if (code === 0) {
        console.log(`ok: Task ${nextTask.id} completed successfully.`);
        updateTaskStatus(statePath, nextTask.id, 'completed', `Completed task ${nextTask.id}`);

        // Run Verification Command
        if (nextTask.verification_command) {
          console.log(`ok: Running verification command for task ${nextTask.id}: ${nextTask.verification_command}`);
          const vArgv = _parseArgv(nextTask.verification_command);
          if (!vArgv) {
            console.error(`FAIL: Verification command for task ${nextTask.id} contains shell operators and was rejected for safety: ${nextTask.verification_command}`);
            updateTaskStatus(statePath, nextTask.id, 'failed', `Verification command rejected (shell operators) for task ${nextTask.id}`);
            executeRollback(nextTask, statePath, phase);
            process.exit(1);
          }
          try {
            execFileSync(vArgv[0], vArgv.slice(1), { cwd: ROOT, stdio: 'inherit' });
            console.log(`ok: Verification passed for task ${nextTask.id}`);
          } catch (err: any) {
            console.error(`FAIL: Verification failed for task ${nextTask.id}: ${err.message}`);
            updateTaskStatus(statePath, nextTask.id, 'failed', `Verification failed for task ${nextTask.id}`);
            executeRollback(nextTask, statePath, phase);
            process.exit(1);
          }
        }
      } else {
        console.error(`FAIL: Task ${nextTask.id} failed with exit code ${code}.`);
        updateTaskStatus(statePath, nextTask.id, 'failed', `Task ${nextTask.id} execution failed`);
        executeRollback(nextTask, statePath, phase);
        process.exit(1);
      }
    } else {
      // If no tasks checklist or all tasks are finished, drive phase change using active role
      const currentRole = state.current_role || 'orchestrator';
      console.log(`ok: [Step ${steps + 1}/${stepLimit}] Spawning agent for phase transition: ${currentRole} (Phase: ${phase})`);

      const logFile = path.join(logDir, `phase-${phase}-${currentRole}.log`);
      const outStream = fs.createWriteStream(logFile);
      const prompt = `You are acting as the specialized '${currentRole}' agent. Resolve/advance phase '${phase}' for task '${state.task_id || 'unspecified'}'.`;

      const code = await new Promise<number>((resolve) => {
        if (process.env.OH_MY_CURSOR_MOCK_AGENT === '1') {
          console.log(`ok: Mock agent execution for phase transition: ${currentRole}`);
          setTimeout(() => {
            resolve(0);
          }, 50);
          return;
        }

        const child = spawn('cursor-agent', [
          '-p',
          '--output-format', 'text',
          '--model', model,
          '--mode', 'ask',
          '--trust',
          '--workspace', ROOT,
          prompt
        ]);

        child.stdout.pipe(outStream);
        child.stderr.pipe(outStream);

        child.on('close', (code) => {
          outStream.close();
          resolve(code ?? 1);
        });
      });

      steps++;

      if (code !== 0) {
        console.error(`FAIL: Phase transition execution for ${currentRole} failed with exit code ${code}.`);
        updateWorkflowStatus(statePath, phase, 'blocked', `Phase transition failed under role ${currentRole}`);
        process.exit(1);
      }
    }
  }

  if (steps >= stepLimit) {
    console.log(`ok: Autopilot suspended because the step limit of ${stepLimit} was reached.`);
    updateWorkflowStatus(statePath, getWorkflowState(statePath).phase, 'in_progress', `Autopilot step limit (${stepLimit}) reached`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  main().catch(err => {
    console.error(`FAIL: Unexpected Autopilot coordinator error: ${err.message}`);
    process.exit(1);
  });
}
