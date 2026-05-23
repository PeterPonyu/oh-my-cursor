import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function log(msg: string): void {
  console.log(`ok: ${msg}`);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const requiredPaths = [
    'AGENTS.md',
    'CHANGELOG.md',
    'README.md',
    '.cursor-plugin/plugin.json',
    'hooks/hooks.json',
    'hooks/README.md',
    'hooks/claim-guard.ts',
    'hooks/prompt-router.ts',
    'hooks/shell-guard.ts',
    'hooks/stop-gate.ts',
    'hooks/session-bootstrap.ts',
    'hooks/session-summary.ts',
    'hooks/tool-guard.ts',
    'hooks/state-watcher.ts',
    'hooks/failure-router.ts',
    'hooks/subagent-bootstrap.ts',
    'hooks/subagent-summary.ts',
    'hooks/shell-debrief.ts',
    'hooks/read-advisor.ts',
    'hooks/compact-reminder.ts',
    '.cursor/state/_locking.ts',
    '.cursor/state/workflow-state.schema.json',
    '.cursor/state/workflow-state.example.json',
    '.cursor/state/workflow-state.ts',
    '.cursor/state/README.md',
    'src/oh_my_cursor/workflow_state/api.ts',
    'src/oh_my_cursor/workflow_state/cli.ts',
    'src/oh_my_cursor/workflow_state/locking.ts',
    'src/oh_my_cursor/workflow_state/index.ts',
    'agents/orchestrator.md',
    'agents/architect.md',
    'agents/verifier.md',
    'agents/critic.md',
    'agents/debugger.md',
    'agents/security-reviewer.md',
    'agents/planner.md',
    'agents/researcher.md',
    'agents/implementer.md',
    'agents/code-reviewer.md',
    'agents/explore.md',
    'agents/qa-tester.md',
    'agents/test-engineer.md',
    'agents/tracer.md',
    'rules/repo-owned-plugin-boundary.mdc',
    'skills/local-plugin-check/SKILL.md',
    'skills/phase-controller/SKILL.md',
    'skills/team-controller/SKILL.md',
    '.cursor/rules/00-repo-scope.mdc',
    '.cursor/rules/10-docs-claims.mdc',
    '.cursor/rules/20-commit-discipline.mdc',
    '.cursor/rules/30-error-handling.mdc',
    'docs/confirmed-surfaces.md',
    'docs/archive/fallback-policy.md',
    'docs/local-plugin-verification.md',
    'docs/orchestration.md',
    'docs/agent-model-policy.md',
    'docs/external-runtime-bridge.md',
    'docs/external-runtime-compatibility.md',
    'docs/references.md',
    'docs/state-contract.md',
    'docs/PR-POLICY.md',
    'scripts/check-local-plugin-install.ts',
    'scripts/check-default-auth.ts',
    'scripts/install-local-plugin.ts',
    'scripts/validate-plugin-structure.ts',
    'scripts/validate-mcp-server-structure.ts',
    'scripts/smoke-mcp-cursor-state-bridge.ts',
    'scripts/validate-rename-references.ts',
    'scripts/validate-prd-ac-mapping.ts',
    'scripts/validate-hook-readonly.ts',
    'scripts/validate-agent-bridge-contract.ts',
    'scripts/validate-agent-model-policy.ts',
    'scripts/validate-public-language.ts',
    'scripts/validate-cursor-workflow-artifacts.ts',
    'scripts/smoke-cursor-workflow-artifacts.ts',
    'scripts/validate-workflow-state.ts',
    'scripts/workflow-state.ts',
    'scripts/validate-state-contract.ts',
    'scripts/smoke-cursor-agent.ts',
    'scripts/resolve-cursor-model.ts',
    'scripts/smoke-agent-model-suitability.ts',
    'scripts/verify-backbone.ts',
    'scripts/run-team-coordinator.ts',
    'scripts/refine-branding.ts',
  ];

  for (const f of requiredPaths) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      fail(`missing required visible surface: ${f}`);
    }
    log(f);
  }

  const getFileCount = (dir: string, extPattern: RegExp): number => {
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (extPattern.test(f)) {
          count++;
        }
      }
    };
    walk(dir);
    return count;
  };

  const agentsCount = getFileCount(path.join(ROOT, 'agents'), /\.md$/);
  const promptsCount = getFileCount(ROOT, /\.prompt\.md$/);
  const skillsCount = getFileCount(ROOT, /^SKILL\.md$/);
  
  let hooksCount = 0;
  const walkHooks = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (f === 'node_modules' || f === 'dist' || f === '.git' || f === '.conda') continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walkHooks(full);
      } else if (f === 'hooks.json') {
        hooksCount++;
      }
    }
  };
  walkHooks(ROOT);

  if (agentsCount < 7) fail('expected at least seven checked-in project agents');
  if (promptsCount !== 0) fail(`unexpected checked-in prompt files: ${promptsCount}`);
  if (skillsCount < 1) fail('expected at least one checked-in skill file');
  if (hooksCount !== 1) fail('expected exactly one checked-in hook manifest');

  log('current repo ships checked-in project agents');
  log('current repo intentionally has 0 checked-in prompt files');
  log('current repo ships at least one checked-in skill bundle');
  log('current repo ships one checked-in hook manifest');

  const filesToScan = [
    path.join(ROOT, 'AGENTS.md'),
    path.join(ROOT, 'README.md'),
    ...fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md')).map(f => path.join(ROOT, 'docs', f))
  ];

  const subject = /(?:oh-my-cursor|this repo|this repository|the repo|this backbone|the backbone|repository|repo)/;
  const verb = /(?:ships?|provides?|includes?|owns?|supports?|provisions?|configures?)/;
  
  const pattern1 = /\brepo[- ](?:file|native)\b.{{0,80}}\bcustom modes?\b/;
  const pattern2 = /\brepo[- ](?:file|native)\b.{{0,80}}\bbackground[- ]agents?\b/;
  const pattern3 = /(?:default|checked[- ]in|repo[- ]owned)\b.{{0,40}}(?:\.cursor\/mcp\.json|mcp config)\b/;

  const negations = [
    'does not', 'do not', 'not ', 'without', 'unless', 'unsupported',
    'out-of-scope', 'not currently', 'not yet', 'avoid', 'left opt-in', 'unclaimed'
  ];

  const violations: string[] = [];
  for (const file of filesToScan) {
    const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
    lines.forEach((rawLine, index) => {
      const lineNo = index + 1;
      const line = rawLine.toLowerCase().replace(/\s+/g, ' ');
      if (!line || negations.some(neg => line.includes(neg))) {
        return;
      }
      if (subject.test(line) && verb.test(line)) {
        if (pattern1.test(line) || pattern2.test(line) || pattern3.test(line)) {
          violations.push(`${path.relative(ROOT, file)}:${lineNo}: ${rawLine.trim()}`);
        }
      }
    });
  }

  if (violations.length > 0) {
    fail(`positive overclaim scan found unsupported repo-owned wording:\n${violations.join('\n')}`);
  }
  log('positive overclaim scan stayed clean for README/AGENTS/docs notes');

  try {
    execSync('node --experimental-strip-types scripts/validate-plugin-structure.ts', { cwd: ROOT });
    execSync('node --experimental-strip-types scripts/validate-public-language.ts', { cwd: ROOT });
    execSync('node --experimental-strip-types scripts/validate-cursor-workflow-artifacts.ts', { cwd: ROOT });
  } catch (err: any) {
    fail(`child validation failed: ${err.message}`);
  }

  const confirmedSurfacesText = fs.readFileSync(path.join(ROOT, 'docs', 'confirmed-surfaces.md'), 'utf-8');
  if (!confirmedSurfacesText.includes('AGENTS.md')) fail('confirmed surfaces doc must mention AGENTS.md');
  if (!confirmedSurfacesText.includes('.cursor/rules')) fail('confirmed surfaces doc must mention .cursor/rules');
  if (!confirmedSurfacesText.includes('hooks/hooks.json')) fail('confirmed surfaces doc must mention hooks/hooks.json');
  if (!confirmedSurfacesText.includes('agents/')) fail('confirmed surfaces doc must mention agents');

  const readmeText = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
  const start = readmeText.indexOf('## Quick start');
  const end = readmeText.indexOf('## What\'s included', start);
  if (start === -1 || end === -1) {
    fail('README is missing the Quick start -> What\'s included structure');
  }
  log('README Quick start -> What\'s included structure present');
  log('DISCOVERABILITY_OK');
  log('surface visibility validation complete');
}

main();
