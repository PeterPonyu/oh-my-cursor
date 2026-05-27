import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const TEMP_STATE = path.join(ROOT, 'temp_test_workflow_state.json');
const CANCEL_DIR = path.join(ROOT, '.omcs');
const CANCEL_FILE = path.join(CANCEL_DIR, 'cancel');

function cleanup() {
  if (fs.existsSync(TEMP_STATE)) {
    try { fs.unlinkSync(TEMP_STATE); } catch {}
  }
  if (fs.existsSync(CANCEL_FILE)) {
    try { fs.unlinkSync(CANCEL_FILE); } catch {}
  }
}

function runConsensusGate(statePath: string): { success: boolean; output: string } {
  try {
    const output = execSync(`node --experimental-strip-types scripts/consensus-gate.ts --state "${statePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output };
  } catch (err: any) {
    return { success: false, output: err.stdout || err.message };
  }
}

function runAutopilot(statePath: string, stepLimit: number): { success: boolean; output: string } {
  try {
    const output = execSync(`node --experimental-strip-types scripts/run-autopilot.ts --state "${statePath}" --step-limit ${stepLimit}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output };
  } catch (err: any) {
    return { success: false, output: err.stdout || err.message };
  }
}

try {
  process.env.OH_MY_CURSOR_MOCK_AGENT = '1';
  console.log('Running Consensus Gate & Bounded Autopilot tests...');

  // --- PART 1: Test Consensus Gate ---
  // Scenario 1A: Empty state history
  fs.writeFileSync(TEMP_STATE, JSON.stringify({
    task_id: "T-TEST",
    phase: "plan",
    status: "in_progress",
    history: []
  }, null, 2));

  let res = runConsensusGate(TEMP_STATE);
  console.log('Scenario 1A (Empty history) Success:', res.success);
  if (res.success) {
    throw new Error('Scenario 1A failed: Consensus gate passed an empty history');
  }

  // Scenario 1B: Only planner
  fs.writeFileSync(TEMP_STATE, JSON.stringify({
    task_id: "T-TEST",
    phase: "plan",
    status: "in_progress",
    history: [
      { note: "Planner proposed plan: added items" }
    ]
  }, null, 2));

  res = runConsensusGate(TEMP_STATE);
  console.log('Scenario 1B (Only planner) Success:', res.success);
  if (res.success) {
    throw new Error('Scenario 1B failed: Consensus gate passed with only planner history');
  }

  // Scenario 1C: Planner + Critic
  fs.writeFileSync(TEMP_STATE, JSON.stringify({
    task_id: "T-TEST",
    phase: "plan",
    status: "in_progress",
    history: [
      { note: "Planner proposed plan: added items" },
      { note: "Critic reviewed plan: approved" }
    ]
  }, null, 2));

  res = runConsensusGate(TEMP_STATE);
  console.log('Scenario 1C (Planner + Critic) Success:', res.success);
  if (res.success) {
    throw new Error('Scenario 1C failed: Consensus gate passed without verifier');
  }

  // Scenario 1D: Planner + Critic + Verifier (Complete)
  fs.writeFileSync(TEMP_STATE, JSON.stringify({
    task_id: "T-TEST",
    phase: "plan",
    status: "in_progress",
    history: [
      { note: "Planner proposed plan: added items" },
      { note: "Critic audited plan and marked it OK" },
      { note: "Verifier checked plan: verification commands approved" }
    ]
  }, null, 2));

  res = runConsensusGate(TEMP_STATE);
  console.log('Scenario 1D (Complete) Success:', res.success);
  if (!res.success) {
    throw new Error('Scenario 1D failed: Consensus gate rejected complete history');
  }


  // --- PART 2: Test Autopilot Runner ---
  // Scenario 2A: Autopilot terminates when state phase is 'done'
  fs.writeFileSync(TEMP_STATE, JSON.stringify({
    task_id: "T-TEST",
    phase: "done",
    status: "passed",
    history: []
  }, null, 2));

  let apiRes = runAutopilot(TEMP_STATE, 5);
  console.log('Scenario 2A (Already Done) Success:', apiRes.success);
  if (!apiRes.success || !apiRes.output.includes('Autopilot loop ended')) {
    throw new Error(`Scenario 2A failed: expected loop to end cleanly, output: ${apiRes.output}`);
  }

  // Scenario 2B: Autopilot step limit check
  // Prepare a state with active task to trigger execution step
  fs.writeFileSync(TEMP_STATE, JSON.stringify({
    task_id: "T-TEST",
    phase: "execute",
    status: "in_progress",
    history: [],
    tasks: [
      { id: "T-1", status: "pending", role: "verifier", prompt: "verify nothing" }
    ]
  }, null, 2));

  // Run with step limit = 0 to trigger immediately
  apiRes = runAutopilot(TEMP_STATE, 0);
  console.log('Scenario 2B (Limit 0) Success:', apiRes.success);
  if (!apiRes.success || !apiRes.output.includes('Autopilot suspended because the step limit')) {
    throw new Error(`Scenario 2B failed: expected suspension on limit, output: ${apiRes.output}`);
  }

  // Scenario 2C: Cancel Token file aborts autopilot run
  fs.mkdirSync(CANCEL_DIR, { recursive: true });
  fs.writeFileSync(CANCEL_FILE, 'cancel');

  fs.writeFileSync(TEMP_STATE, JSON.stringify({
    task_id: "T-TEST",
    phase: "execute",
    status: "in_progress",
    history: [],
    tasks: [
      { id: "T-1", status: "pending", role: "verifier", prompt: "verify nothing" }
    ]
  }, null, 2));

  apiRes = runAutopilot(TEMP_STATE, 5);
  console.log('Scenario 2C (Cancel Token) Success:', apiRes.success);
  if (!apiRes.success || !apiRes.output.includes('Autopilot execution cancelled')) {
    throw new Error(`Scenario 2C failed: expected run to be cancelled, output: ${apiRes.output}`);
  }
  if (fs.existsSync(CANCEL_FILE)) {
    throw new Error('Scenario 2C failed: cancel token file was not consumed/deleted');
  }

  // Scenario 2D: Task failure triggers rollback execution
  const tempRollbackFile = path.join(ROOT, 'temp_rolled_back.txt');
  if (fs.existsSync(tempRollbackFile)) {
    try { fs.unlinkSync(tempRollbackFile); } catch {}
  }

  // Write a small helper script that the rollback_plan can call without shell operators.
  // rollback_plan must not use shell metacharacters (|, &, ;, >, <, `, $) because
  // run-autopilot now invokes commands via execFileSync (no shell=true).
  const tempRollbackScript = path.join(ROOT, 'temp_rollback_helper.mjs');
  fs.writeFileSync(
    tempRollbackScript,
    `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(tempRollbackFile)}, 'rolled back', 'utf-8');\n`,
    'utf-8'
  );

  fs.writeFileSync(TEMP_STATE, JSON.stringify({
    task_id: "T-TEST",
    phase: "execute",
    status: "in_progress",
    history: [],
    tasks: [
      {
        id: "T-1",
        status: "pending",
        role: "verifier",
        prompt: "verify failure trigger",
        verification_command: "node --input-type=module --eval \"process.exit(1)\"",
        rollback_plan: `node ${tempRollbackScript}`
      }
    ]
  }, null, 2));

  apiRes = runAutopilot(TEMP_STATE, 5);
  console.log('Scenario 2D (Rollback Trigger) Success:', !apiRes.success);
  console.log('Rollback File Exists:', fs.existsSync(tempRollbackFile));
  
  if (apiRes.success) {
    throw new Error('Scenario 2D failed: expected autopilot to fail, but it returned success');
  }
  if (!fs.existsSync(tempRollbackFile)) {
    throw new Error('Scenario 2D failed: rollback command did not execute/create temp file');
  }
  
  if (fs.existsSync(tempRollbackFile)) {
    try { fs.unlinkSync(tempRollbackFile); } catch {}
  }
  if (fs.existsSync(tempRollbackScript)) {
    try { fs.unlinkSync(tempRollbackScript); } catch {}
  }

  const resultingState = JSON.parse(fs.readFileSync(TEMP_STATE, 'utf-8'));
  const rollbackLogged = resultingState.history.some((h: any) => h.note.includes('Executed rollback plan'));
  console.log('Rollback Logged in History:', rollbackLogged);
  if (!rollbackLogged) {
    throw new Error('Scenario 2D failed: rollback action was not logged in state history');
  }

  console.log('All Consensus Gate & Autopilot tests passed successfully!');
} finally {
  // Clean up temp rollback helper script if it exists
  const helperScript = path.join(ROOT, 'temp_rollback_helper.mjs');
  if (fs.existsSync(helperScript)) {
    try { fs.unlinkSync(helperScript); } catch {}
  }
  cleanup();
}
