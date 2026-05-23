import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const PLAN_PATH = path.join(ROOT, 'docs', 'plans', 'mcp-state-bridge-2026-05', 'consensus-plan.md');
const PRD_PATH = path.join(ROOT, 'docs', 'PRD.yaml');

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`ok: ${message}`);
}

function planAcIds(): Set<string> {
  if (!fs.existsSync(PLAN_PATH) || !fs.statSync(PLAN_PATH).isFile()) {
    fail(`consensus plan not found: ${PLAN_PATH}`);
  }
  const text = fs.readFileSync(PLAN_PATH, 'utf-8');
  const matches = text.match(/\bAC-\d{3}\b/g) || [];
  return new Set(matches);
}

function prdAcIds(): Set<string> {
  if (!fs.existsSync(PRD_PATH) || !fs.statSync(PRD_PATH).isFile()) {
    fail(`PRD not found: ${PRD_PATH}`);
  }
  const text = fs.readFileSync(PRD_PATH, 'utf-8');
  let inBlock = false;
  const seen = new Set<string>();
  const prdRowRe = /^\s{2}(AC-\d{3})\s*:\s*\{/;

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === 'mcp_acceptance_criteria:') {
      inBlock = true;
      continue;
    }
    if (!inBlock) {
      continue;
    }
    if (raw && !raw.startsWith(' ') && !raw.startsWith('#')) {
      // Block ended (next top-level key).
      break;
    }
    const match = prdRowRe.exec(raw);
    if (match) {
      seen.add(match[1]);
    }
  }
  return seen;
}

function main() {
  const plan = planAcIds();
  const prd = prdAcIds();

  if (plan.size === 0) {
    fail('no AC-NNN identifiers found in consensus plan');
  }
  if (prd.size === 0) {
    fail(
      "no AC-NNN rows found in PRD.yaml under mcp_acceptance_criteria; " +
      "expected '  AC-NNN: { phase: ..., status: ..., summary: ... }'"
    );
  }

  const missingInPrd = Array.from(plan).filter(id => !prd.has(id)).sort();
  if (missingInPrd.length > 0) {
    fail(
      'plan AC IDs missing from docs/PRD.yaml#mcp_acceptance_criteria: ' +
      missingInPrd.join(', ')
    );
  }

  const orphanInPrd = Array.from(prd).filter(id => !plan.has(id)).sort();
  if (orphanInPrd.length > 0) {
    fail(
      'PRD.yaml#mcp_acceptance_criteria has rows not referenced in the consensus plan: ' +
      orphanInPrd.join(', ')
    );
  }

  ok(`plan AC IDs (${plan.size}) all mapped in PRD.yaml; no orphans`);
  console.log('PRD_AC_MAPPING_OK');
  process.exit(0);
}

main();
