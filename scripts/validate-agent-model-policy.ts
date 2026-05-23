import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const POLICY = path.join(ROOT, 'docs', 'agent-model-policy.md');
const AGENTS = path.join(ROOT, 'agents');

const EXPECTED_ROLES = new Set([
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
]);

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function parseFrontmatter(filePath: string): Record<string, string> {
  const text = fs.readFileSync(filePath, 'utf-8');
  if (!text.startsWith('---\n')) {
    fail(`${path.relative(ROOT, filePath)} missing frontmatter`);
  }
  const end = text.indexOf('\n---', 4);
  if (end === -1) {
    fail(`${path.relative(ROOT, filePath)} unterminated frontmatter`);
  }
  const values: Record<string, string> = {};
  const lines = text.slice(4, end).trim().split(/\r?\n/);
  for (const raw of lines) {
    if (!raw.includes(':')) continue;
    const parts = raw.split(':');
    const key = parts[0].trim();
    const value = parts.slice(1).join(':').trim().replace(/^["']|["']$/g, '');
    values[key] = value;
  }
  return values;
}

function validatePolicyDoc() {
  if (!fs.existsSync(POLICY)) {
    fail('missing docs/agent-model-policy.md');
  }
  const text = fs.readFileSync(POLICY, 'utf-8');
  const requiredTokens = [
    'All checked-in role agents under `agents/` use:',
    'model: auto',
    'Why Not Pin Composer Everywhere?',
    'Role Suitability Matrix',
    'Promotion Path',
    'scripts/resolve-cursor-model.ts',
    'scripts/smoke-agent-model-suitability.ts',
  ];
  for (const token of requiredTokens) {
    if (!text.includes(token)) {
      fail(`agent model policy missing token: ${token}`);
    }
  }

  for (const role of Array.from(EXPECTED_ROLES).sort()) {
    const pattern = new RegExp(`\\| \`${role}\` \\| \`model: auto\` \\|`);
    if (!pattern.test(text)) {
      fail(`agent model policy missing role row for ${role}`);
    }
  }
}

function validateAgentFrontmatter() {
  const names = new Set<string>();
  const files = fs.readdirSync(AGENTS).filter(f => f.endsWith('.md')).sort();
  for (const file of files) {
    const full = path.join(AGENTS, file);
    const fields = parseFrontmatter(full);
    const name = fields.name || '';
    names.add(name);
    const stem = path.basename(file, '.md');
    if (name !== stem) {
      fail(`${path.relative(ROOT, full)} name must match filename`);
    }
    if (fields.model !== 'auto') {
      fail(`${path.relative(ROOT, full)} must stay model: auto until benchmark promotion`);
    }
  }

  const missing = Array.from(EXPECTED_ROLES).filter(r => !names.has(r));
  const extra = Array.from(names).filter(r => !EXPECTED_ROLES.has(r));
  if (missing.length > 0) {
    fail(`missing governed agents: ${missing.sort().join(', ')}`);
  }
  if (extra.length > 0) {
    fail(`unexpected ungoverned agents: ${extra.sort().join(', ')}`);
  }
}

function main() {
  validatePolicyDoc();
  validateAgentFrontmatter();
  console.log('AGENT_MODEL_POLICY_OK');
}

main();
