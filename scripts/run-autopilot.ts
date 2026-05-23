import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fileLock } from '../src/oh_my_cursor/workflow_state/locking.ts';

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
  let statePath = process.env.OH_MY_CURSOR_WORKFLOW_STATE || '';
  let stepLimit = parseInt(process.env.OH_MY_CURSOR_STEP_LIMIT || '5', 10);

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
    statePath = path.join(ROOT, '.cursor', 'state', 'workflow-state.json');
  } else {
    if (statePath.startsWith('~')) {
      const homedir = process.env.HOME || '';
      statePath = path.join(homedir, statePath.slice(1));
    }
    if (!path.isAbsolute(statePath)) {
      statePath = path.resolve(ROOT, statePath);
    }
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

  const logDir = path.join(ROOT, '.cursor-agent-logs');
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
          try {
            execSync(nextTask.verification_command, { cwd: ROOT, stdio: 'inherit' });
            console.log(`ok: Verification passed for task ${nextTask.id}`);
          } catch (err: any) {
            console.error(`FAIL: Verification failed for task ${nextTask.id}: ${err.message}`);
            updateTaskStatus(statePath, nextTask.id, 'failed', `Verification failed for task ${nextTask.id}`);
            updateWorkflowStatus(statePath, phase, 'blocked', `Task ${nextTask.id} verification failed`);
            process.exit(1);
          }
        }
      } else {
        console.error(`FAIL: Task ${nextTask.id} failed with exit code ${code}.`);
        updateTaskStatus(statePath, nextTask.id, 'failed', `Task ${nextTask.id} execution failed`);
        updateWorkflowStatus(statePath, phase, 'blocked', `Task ${nextTask.id} failed`);
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

main().catch(err => {
  console.error(`FAIL: Unexpected Autopilot coordinator error: ${err.message}`);
  process.exit(1);
});
