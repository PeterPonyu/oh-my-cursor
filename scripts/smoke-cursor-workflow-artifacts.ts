import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const tests = [
  { script: 'hooks/session-bootstrap.ts', payload: '{"event":"sessionStart","session_id":"smoke","is_background_agent":false,"composer_mode":"agent"}' },
  { script: 'hooks/session-summary.ts', payload: '{"event":"sessionEnd","session_id":"smoke","reason":"completed","duration_ms":1000,"final_status":"completed"}' },
  { script: 'hooks/prompt-router.ts', payload: '{"event":"beforeSubmitPrompt","prompt":"please run phase-controller and verify the orchestration"}' },
  { script: 'hooks/tool-guard.ts', payload: '{"event":"preToolUse","tool_name":"Edit","tool_input":{"file_path":"README.md"}}' },
  { script: 'hooks/state-watcher.ts', payload: '{"event":"postToolUse","tool_name":"Edit","tool_input":{"file_path":"README.md"},"tool_output":"ok"}' },
  { script: 'hooks/failure-router.ts', payload: '{"event":"postToolUseFailure","tool_name":"Bash","tool_input":{"command":"false"},"error_message":"exit 1","failure_type":"fixable"}' },
  { script: 'hooks/subagent-bootstrap.ts', payload: '{"event":"subagentStart","subagent_id":"sa1","subagent_type":"verifier","task":"check"}' },
  { script: 'hooks/subagent-summary.ts', payload: '{"event":"subagentStop","subagent_type":"verifier","status":"completed","summary":"ok","duration_ms":500}' },
  { script: 'hooks/shell-guard.ts', payload: '{"event":"beforeShellExecution","command":"git status"}' },
  { script: 'hooks/shell-debrief.ts', payload: '{"event":"afterShellExecution","command":"node scripts/validate-workflow-state.ts","output":"WORKFLOW_STATE_OK","duration":150,"sandbox":"trusted"}' },
  { script: 'hooks/read-advisor.ts', payload: '{"event":"beforeReadFile","file_path":".cursor/state/workflow-state.example.json","content":""}' },
  { script: 'hooks/claim-guard.ts', payload: '{"event":"afterFileEdit","edited_files":["README.md"]}' },
  { script: 'hooks/compact-reminder.ts', payload: '{"event":"preCompact","trigger":"auto","context_usage_percent":85}' },
  { script: 'hooks/stop-gate.ts', payload: '{"event":"stop","status":"ok","loop_count":0}' },
];

function main() {
  for (const t of tests) {
    const absPath = path.join(ROOT, t.script);
    try {
      const output = execSync(`node --experimental-strip-types "${absPath}"`, {
        input: t.payload,
        encoding: 'utf-8',
      });
      JSON.parse(output.trim());
    } catch (err: any) {
      fail(`Failed smoking hook ${t.script} with payload: ${err.message}`);
    }
  }

  try {
    execSync('node --experimental-strip-types scripts/validate-cursor-workflow-artifacts.ts', { cwd: ROOT, stdio: 'inherit' });
    execSync('node --experimental-strip-types scripts/validate-workflow-state.ts', { cwd: ROOT, stdio: 'ignore' });
  } catch (err: any) {
    fail(`Validation checks failed: ${err.message}`);
  }

  console.log('CURSOR_WORKFLOW_ARTIFACTS_SMOKE_OK');
}

main();
