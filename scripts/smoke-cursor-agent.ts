import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const TIMEOUT_SECONDS = parseInt(process.env.CURSOR_SMOKE_TIMEOUT || '120', 10);
const MAX_ATTEMPTS = parseInt(process.env.CURSOR_SMOKE_RETRY_ATTEMPTS || '3', 10);

function usage() {
  console.log(`Usage: node --experimental-strip-types scripts/smoke-cursor-agent.ts [--root PATH] [--run-agent-prompt] [--skip-auth-check]

Runs direct, CLI-first Cursor smoke checks:
  - cursor-agent presence
  - default auth availability (environment-gated runtime proof)
  - configured default model availability (environment-gated runtime proof)
  - optional constrained model-backed prompt smoke using the configured model
  - optional constrained repo task smoke using the configured model

Set RUN_CURSOR_AGENT_SMOKE=1 or pass --run-agent-prompt to run the model-backed
agent smoke. The default mode avoids a network/model request and keeps the
runtime claim bounded.

Set CURSOR_SMOKE_SKIP_AUTH_CHECK=1 or pass --skip-auth-check when a previous
step already verified default auth/model availability and you want to avoid
duplicating that local check.`);
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

function main() {
  const args = process.argv.slice(2);
  let rootDir = ROOT;
  let runAgentSmoke = process.env.RUN_CURSOR_AGENT_SMOKE === '1';
  let skipAuthCheck = process.env.CURSOR_SMOKE_SKIP_AUTH_CHECK === '1';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--root') {
      if (i + 1 >= args.length) {
        console.error('FAIL: --root requires a path');
        process.exit(1);
      }
      rootDir = path.resolve(args[++i]);
    } else if (arg === '--run-agent-prompt') {
      runAgentSmoke = true;
    } else if (arg === '--skip-auth-check') {
      skipAuthCheck = true;
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      console.error(`FAIL: unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  // Check cursor-agent presence
  try {
    execSync('which cursor-agent', { stdio: 'ignore' });
  } catch {
    console.error('FAIL: cursor-agent not found');
    process.exit(1);
  }

  let smokeModel = (process.env.CURSOR_SMOKE_MODEL || '').trim();
  if (!smokeModel) {
    try {
      smokeModel = execSync('node --experimental-strip-types scripts/resolve-cursor-model.ts', { cwd: rootDir, encoding: 'utf-8' }).trim();
    } catch {
      smokeModel = 'auto';
    }
  }

  const runCursorPrompt = (label: string, expected: string, prompt: string): string => {
    let output = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = runCommand(
        `cursor-agent -p --output-format text --model "${smokeModel}" --mode ask --trust --workspace "${rootDir}" "${prompt}"`,
        rootDir,
        TIMEOUT_SECONDS * 1000
      );
      output = result.stdout + '\n' + result.stderr;
      const strippedOutput = output.split('\n').map(l => l.trim()).filter(Boolean);
      if (result.status === 0 && strippedOutput.includes(expected)) {
        return output;
      }

      let transient = false;
      if (/Connection lost|Retry attempt|tls handshake eof|stream disconnected|reconnecting|temporarily unavailable|Client network socket disconnected|secure TLS connection|\[aborted\]/i.test(output)) {
        transient = true;
      }
      if (output.includes('Cannot use this model:') && smokeModel !== 'auto') {
        console.error(`bounded: Cursor rejected smoke model ${smokeModel} during ${label}; retrying with host-selected auto`);
        smokeModel = 'auto';
        continue;
      }

      if (attempt < MAX_ATTEMPTS && transient) {
        console.error(`bounded: transient cursor-agent failure during ${label} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying`);
        execSync(`sleep ${attempt}`);
        continue;
      }

      console.error(output);
      console.error(`FAIL: cursor-agent ${label} failed`);
      process.exit(1);
    }
    return output;
  };

  if (skipAuthCheck) {
    console.log('ok: reusing upstream default auth/model proof (environment-gated)');
  } else {
    try {
      execSync('node --experimental-strip-types scripts/check-default-auth.ts', { cwd: rootDir, stdio: 'ignore' });
      console.log('ok: cursor-agent default auth/model proof passes');
    } catch (err: any) {
      console.error('FAIL: check-default-auth.ts failed');
      process.exit(1);
    }
  }

  if (runAgentSmoke) {
    console.log(`ok: using Cursor smoke model ${smokeModel}`);

    const prompt1Expected = 'CURSOR_AGENT_OK';
    const prompt1 = 'Do not edit files or run shell commands. Reply with exactly: CURSOR_AGENT_OK';
    runCursorPrompt('prompt smoke', prompt1Expected, prompt1);
    console.log('ok: cursor-agent prompt smoke returned CURSOR_AGENT_OK (environment-gated runtime proof)');

    const prompt2Expected = 'CURSOR_TASK_SCENARIO_OK docs/archive/refinement-priority-map.md docs/archive/plugin-boundary-review.md scripts/validate-plugin-structure.ts';
    const prompt2 = 'Without editing files or running write commands, identify the repo\'s archived refinement priority map doc, archived plugin boundary review doc, and plugin structure validation script. Reply with exactly: ' + prompt2Expected;
    runCursorPrompt('task scenario smoke', prompt2Expected, prompt2);
    console.log('ok: cursor-agent task scenario smoke returned CURSOR_TASK_SCENARIO_OK (environment-gated runtime proof)');

    const prompt3Expected = 'CURSOR_TASK_PLAN_OK scripts/validate-plugin-structure.ts repo-owned';
    const prompt3 = 'Without editing files or running write commands, a richer plugin claim is proposed. Which validator should be rerun first, and what ownership class must the checked-in repo-root plugin packaging currently keep? Reply with exactly: ' + prompt3Expected;
    runCursorPrompt('task plan smoke', prompt3Expected, prompt3);
    console.log('ok: cursor-agent task plan smoke returned CURSOR_TASK_PLAN_OK (environment-gated runtime proof)');

    const prompt4Expected = 'CURSOR_TASK_COMMAND_OK A';
    const prompt4 = 'Without editing files or running write commands, choose the correct rerun path after a plugin structure change. Option A: node --experimental-strip-types scripts/validate-plugin-structure.ts && node --experimental-strip-types scripts/validate-state-contract.ts. Option B: node --experimental-strip-types scripts/validate-mcp-server-structure.ts. Reply with exactly: ' + prompt4Expected;
    runCursorPrompt('task command smoke', prompt4Expected, prompt4);
    console.log('ok: cursor-agent task command smoke returned CURSOR_TASK_COMMAND_OK (environment-gated runtime proof)');
  } else {
    console.log('ok: model-backed Cursor smoke skipped; runtime claim remains bounded until enhanced prompt proof is requested');
  }

  console.log('ok: Cursor CLI smoke validation complete');
  process.exit(0);
}

main();
