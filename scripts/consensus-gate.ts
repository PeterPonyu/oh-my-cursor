import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { fileLock } from '../src/oh_my_cursor/workflow_state/locking.ts';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function usage() {
  console.log(`Usage: node --experimental-strip-types scripts/consensus-gate.ts [--state PATH]

Verifies that the proposed plan has consensus from the planner, critic, and verifier:
  - Planner must have proposed the plan.
  - Critic must have audited/reviewed the plan.
  - Verifier must have checked/verified the checklist.
Exits with 0 if consensus is reached, 1 otherwise.`);
}

function main() {
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
    console.error(`FAIL: Workflow state file not found at ${statePath}`);
    process.exit(1);
  }

  const result = fileLock(statePath, () => {
    try {
      const raw = fs.readFileSync(statePath, 'utf-8');
      const data = JSON.parse(raw);
      
      const history = data.history || [];
      
      let hasPlanner = false;
      let hasCritic = false;
      let hasVerifier = false;

      const plannerRegex = /planner/i;
      const plannerActionRegex = /propos|plan|draft|init/i;

      const criticRegex = /critic/i;
      const criticActionRegex = /review|audit|approv|comment|ok/i;

      const verifierRegex = /verifier/i;
      const verifierActionRegex = /check|verify|approv|ok/i;

      for (const entry of history) {
        const note = String(entry.note || '');
        if (plannerRegex.test(note) && plannerActionRegex.test(note)) {
          hasPlanner = true;
        }
        if (criticRegex.test(note) && criticActionRegex.test(note)) {
          hasCritic = true;
        }
        if (verifierRegex.test(note) && verifierActionRegex.test(note)) {
          hasVerifier = true;
        }
      }

      return {
        hasPlanner,
        hasCritic,
        hasVerifier,
        phase: data.phase,
        status: data.status
      };
    } catch (err: any) {
      console.error(`FAIL: Error reading or parsing state file: ${err.message}`);
      process.exit(1);
    }
  });

  console.log(`ok: Current workflow phase: ${result.phase}, status: ${result.status}`);
  console.log(`ok: Planner consensus check: ${result.hasPlanner ? 'PASS' : 'MISSING'}`);
  console.log(`ok: Critic consensus check: ${result.hasCritic ? 'PASS' : 'MISSING'}`);
  console.log(`ok: Verifier consensus check: ${result.hasVerifier ? 'PASS' : 'MISSING'}`);

  const missing: string[] = [];
  if (!result.hasPlanner) missing.push('Planner proposal');
  if (!result.hasCritic) missing.push('Critic audit/review');
  if (!result.hasVerifier) missing.push('Verifier approval');

  if (missing.length > 0) {
    console.error(`FAIL: Consensus Planning Gate blocked. Missing: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('ok: Consensus Planning Gate passed successfully!');
  process.exit(0);
}

main();
