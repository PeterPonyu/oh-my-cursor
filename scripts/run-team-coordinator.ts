import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fileLock } from '../src/oh_my_cursor/workflow_state/locking.ts';

interface Task {
  id: string;
  status: string;
  role: string;
  prompt: string;
  dependencies?: string[];
}

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function usage() {
  console.log(`Usage: node --experimental-strip-types scripts/run-team-coordinator.ts [--state PATH]

Runs the Team Mode Coordinator:
  - Parses workflow-state.json tasks checklist
  - Spawns background cursor-agent processes for parallelizable tasks
  - Monitors lifecycles, redirects logs to .cursor-agent-logs/
  - Updates workflow state on completion/failure`);
}

function getTasks(filePath: string): Task[] {
  return fileLock(filePath, () => {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return data.tasks || [];
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

    // Write atomically
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

    // Write atomically
    const dir = path.dirname(filePath);
    const tmpName = path.join(
      dir,
      `.${path.basename(filePath)}.${Math.random().toString(36).slice(2)}.${process.pid}.tmp`
    );
    fs.writeFileSync(tmpName, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmpName, filePath);
  });
}

async function main() {
  const args = process.argv.slice(2);
  let statePath = process.env.OH_MY_CURSOR_WORKFLOW_STATE || '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--state') {
      if (i + 1 >= args.length) {
        console.error('FAIL: --state requires a path');
        process.exit(1);
      }
      statePath = args[++i];
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
    console.error(`FAIL: state file not found: ${statePath}`);
    process.exit(1);
  }

  console.log(`ok: using workflow state file: ${statePath}`);

  let smokeModel = (process.env.CURSOR_SMOKE_MODEL || '').trim();
  if (!smokeModel) {
    try {
      smokeModel = execSync('node --experimental-strip-types scripts/resolve-cursor-model.ts', { cwd: ROOT, encoding: 'utf-8' }).trim();
    } catch {
      smokeModel = 'auto';
    }
  }
  console.log(`ok: using model: ${smokeModel}`);

  const logDir = path.join(ROOT, '.cursor-agent-logs');
  fs.mkdirSync(logDir, { recursive: true });

  const activeProcesses = new Map<string, { child: any; logFile: string }>();
  let hasFailedTask = false;

  while (true) {
    const tasks = getTasks(statePath);
    if (tasks.length === 0) {
      console.log('ok: no tasks found in state file tasks checklist');
      break;
    }

    const allFinished = tasks.every(t => ['completed', 'passed', 'skipped', 'failed', 'blocked'].includes(t.status));
    if (allFinished) {
      console.log('ok: all tasks finished');
      break;
    }

    if (hasFailedTask) {
      if (activeProcesses.size === 0) {
        break;
      }
    } else {
      const eligibleTasks = tasks.filter(t => {
        if (t.status !== 'pending' && t.status !== 'claimed') {
          return false;
        }
        if (t.dependencies && t.dependencies.length > 0) {
          return t.dependencies.every(depId => {
            const dep = tasks.find(x => x.id === depId);
            return dep && ['completed', 'passed', 'skipped'].includes(dep.status);
          });
        }
        return true;
      });

      for (const task of eligibleTasks) {
        if (activeProcesses.has(task.id)) {
          continue;
        }

        console.log(`ok: spawning background agent for task ${task.id} (${task.role})`);
        updateTaskStatus(statePath, task.id, 'in_progress', `Started task ${task.id}`);

        const logFile = path.join(logDir, `task-${task.id}.log`);
        const outStream = fs.createWriteStream(logFile);
        const prompt = `You are acting as the specialized '${task.role}' agent. Perform the following task: ${task.prompt}`;

        const child = spawn('cursor-agent', [
          '-p',
          '--output-format', 'text',
          '--model', smokeModel,
          '--mode', 'ask',
          '--trust',
          '--workspace', ROOT,
          prompt
        ]);

        child.stdout.pipe(outStream);
        child.stderr.pipe(outStream);

        activeProcesses.set(task.id, { child, logFile });

        child.on('close', (code) => {
          activeProcesses.delete(task.id);
          outStream.close();

          if (code === 0) {
            console.log(`ok: task ${task.id} completed successfully`);
            updateTaskStatus(statePath, task.id, 'completed', `Completed task ${task.id} successfully`);
          } else {
            console.error(`FAIL: task ${task.id} failed with exit code ${code}`);
            updateTaskStatus(statePath, task.id, 'failed', `Task ${task.id} failed`);
            hasFailedTask = true;
          }
        });
      }
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const finalTasks = getTasks(statePath);
  const failedTasks = finalTasks.filter(t => t.status === 'failed');

  if (failedTasks.length > 0) {
    console.error(`FAIL: team coordination failed with ${failedTasks.length} failed task(s)`);
    updateWorkflowStatus(statePath, 'blocked', 'failed', 'Team coordination failed');
    process.exit(1);
  } else {
    console.log('ok: team coordination completed successfully');
    updateWorkflowStatus(statePath, 'execute', 'passed', 'Team coordination completed successfully');
    process.exit(0);
  }
}

main().catch(err => {
  console.error(`FAIL: unexpected coordinator error: ${err.message}`);
  process.exit(1);
});
