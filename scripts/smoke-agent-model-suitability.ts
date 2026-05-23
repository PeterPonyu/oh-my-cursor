import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const TIMEOUT_SECONDS = parseInt(process.env.CURSOR_SMOKE_TIMEOUT || '120', 10);
const ALL_ROLES = [
  'architect',
  'orchestrator',
  'researcher',
  'explore',
  'planner',
  'qa-tester',
  'implementer',
  'debugger',
  'test-engineer',
  'verifier',
  'critic',
  'code-reviewer',
  'security-reviewer',
  'tracer',
];

function usage() {
  console.log(`Usage: node --experimental-strip-types scripts/smoke-agent-model-suitability.ts [--run-model-smoke] [--roles a,b,c] [--all-roles]

Validates the OMCS agent model policy and, when explicitly requested, runs a
small environment-gated Cursor Agent smoke for selected governed roles using
the resolved parent CLI model. This smoke does not change agent frontmatter; it
records whether the current account/model can follow role-specific instructions.

Set RUN_AGENT_MODEL_SUITABILITY_SMOKE=1 or pass --run-model-smoke to run the
model-backed role prompts. By default it checks a representative sample:
orchestrator, verifier, code-reviewer. Use --all-roles only for a long benchmark
run, or pass --roles role-a,role-b.`);
}

function runCommand(cmd: string, cwd: string, timeoutMs: number): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, { cwd, timeout: timeoutMs, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { status: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? '',
    };
  }
}

function fallbackModel(): string {
  try {
    const output = execSync('cursor-agent --list-models 2>/dev/null || cursor-agent models 2>/dev/null', { encoding: 'utf-8' });
    const models: string[] = [];
    for (const raw of output.split(/\r?\n/)) {
      const line = raw.trim();
      const lower = line.toLowerCase();
      if (!line || lower.startsWith('available models') || lower.startsWith('no models available')) {
        continue;
      }
      const slug = line.includes(' - ') ? line.split(' - ')[0].trim() : line.split(/\s+/)[0];
      if (slug && !models.includes(slug)) {
        models.push(slug);
      }
    }
    const prefs = ['composer-2.5-fast', 'composer-2.5', 'auto'];
    return prefs.find(p => models.includes(p)) || models[0] || '';
  } catch {
    return '';
  }
}

function main() {
  const args = process.argv.slice(2);
  let runModelSmoke = process.env.RUN_AGENT_MODEL_SUITABILITY_SMOKE === '1';
  let rolesSelection = 'orchestrator,verifier,code-reviewer';
  let useAllRoles = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--run-model-smoke') {
      runModelSmoke = true;
    } else if (arg === '--roles') {
      if (i + 1 >= args.length) {
        console.error('FAIL: --roles requires a comma-separated list');
        process.exit(1);
      }
      rolesSelection = args[++i];
    } else if (arg === '--all-roles') {
      useAllRoles = true;
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      console.error(`FAIL: unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  // First run validate-agent-model-policy.ts
  try {
    console.log('Running agent model policy validator...');
    execSync('node --experimental-strip-types scripts/validate-agent-model-policy.ts', { cwd: ROOT, stdio: 'inherit' });
  } catch (err: any) {
    console.error('FAIL: validate-agent-model-policy.ts failed');
    process.exit(1);
  }

  if (!runModelSmoke) {
    console.log('ok: role model suitability prompt smoke skipped; set RUN_AGENT_MODEL_SUITABILITY_SMOKE=1 to run model-backed checks');
    process.exit(0);
  }

  // Check if cursor-agent is installed
  try {
    execSync('which cursor-agent', { stdio: 'ignore' });
  } catch {
    console.error('FAIL: cursor-agent not found');
    process.exit(1);
  }

  let model = (process.env.CURSOR_SMOKE_MODEL || '').trim();
  if (!model) {
    try {
      model = execSync('node --experimental-strip-types scripts/resolve-cursor-model.ts', { cwd: ROOT, encoding: 'utf-8' }).trim();
    } catch {
      model = 'auto';
    }
  }

  console.log(`ok: using Cursor role suitability smoke model ${model}`);

  const roles = useAllRoles ? ALL_ROLES : rolesSelection.split(',').map(r => r.trim()).filter(Boolean);

  for (const role of roles) {
    if (!ALL_ROLES.includes(role)) {
      console.error(`FAIL: unknown role for model suitability smoke: ${role}`);
      process.exit(1);
    }
  }

  for (const role of roles) {
    const expected = `ROLE_MODEL_SMOKE_OK ${role}`;
    const prompt = `Do not edit files or run shell commands. Read agents/${role}.md conceptually as the role contract. Reply with exactly: ${expected}`;
    let success = false;
    let output = '';

    for (let attempt = 1; attempt <= 5; attempt++) {
      const result = runCommand(
        `cursor-agent -p --output-format text --model "${model}" --mode ask --trust --workspace "${ROOT}" "${prompt}"`,
        ROOT,
        TIMEOUT_SECONDS * 1000
      );
      output = result.stdout + '\n' + result.stderr;
      if (result.status === 0) {
        success = true;
        break;
      }
      if (output.includes('Cannot use this model:')) {
        let nextModel = 'auto';
        if (model === 'auto') {
          nextModel = fallbackModel();
        }
        if (nextModel && nextModel !== model) {
          console.error(`bounded: Cursor rejected role smoke model ${model} for ${role}; retrying with ${nextModel}`);
          model = nextModel;
          continue;
        }
        if (!nextModel && attempt < 5) {
          console.error(`bounded: Cursor rejected role smoke model ${model} for ${role} and model list was unavailable; retrying same model`);
          execSync(`sleep ${attempt}`);
          continue;
        }
      }
      if (attempt < 5 && /Connection lost|Retry attempt|tls handshake eof|stream disconnected|reconnecting|temporarily unavailable|Client network socket disconnected|secure TLS connection|\[aborted\]/i.test(output)) {
        console.error(`bounded: transient cursor-agent failure during role smoke for ${role} (attempt ${attempt}/5), retrying`);
        execSync(`sleep ${attempt}`);
        continue;
      }
      console.error(output);
      console.error(`FAIL: role model suitability smoke failed for ${role}`);
      process.exit(1);
    }

    if (!success || !output.includes(expected)) {
      console.error(output);
      console.error(`FAIL: role model suitability smoke missing expected marker for ${role}`);
      process.exit(1);
    }
    console.log(`ok: role model suitability smoke passed for ${role}`);
  }

  console.log('AGENT_MODEL_SUITABILITY_SMOKE_OK');
  process.exit(0);
}

main();
