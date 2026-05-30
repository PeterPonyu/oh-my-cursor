import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function log(msg: string) {
  console.log(`ok: ${msg}`);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const required = [
  'AGENTS.md',
  'CHANGELOG.md',
  'README.md',
  'assets/oh-my-cursor-character.jpg',
  'assets/oh-my-cursor-social-preview.jpg',
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
  'src/oh_my_cursor/workflow_state/index.ts',
  'src/oh_my_cursor/workflow_state/api.ts',
  'src/oh_my_cursor/workflow_state/cli.ts',
  'src/oh_my_cursor/workflow_state/locking.ts',
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
  'docs/surface-inventory.json',
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
  'scripts/e2e-qa-session-assets.ts',
  'scripts/link-omc-cursor-compat-assets.ts',
  'scripts/resolve-cursor-model.ts',
  'scripts/validate-agent-model-policy.ts',
  'scripts/smoke-agent-model-suitability.ts',
  'scripts/run-team-coordinator.ts',
  'scripts/refine-branding.ts',
  'scripts/rule-doctor.ts',
  'scripts/validate-surface-inventory.ts',
  '.cursor/state/project-memory.ts',
  '.cursor/state/notepad.md',
];


/** Recursively collect files matching given extensions under a directory. */
function collectFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

/** Brand-independence: ensure static site output contains no forbidden branding. */
function checkBrandIndependence() {
  const outDir = path.join(ROOT, 'apps', 'cursor-backbone-site', 'out');
  if (!fs.existsSync(outDir)) {
    log('brand-independence: out/ directory absent — skipping (site not built)');
    return;
  }

  const forbidden: { label: string; pattern: RegExp }[] = [
    { label: 'oh-my-copilot', pattern: /oh-my-copilot/i },
    { label: 'peterponyu', pattern: /peterponyu/i },
    { label: 'sibling context', pattern: /sibling context/i },
    { label: 'sibling site', pattern: /sibling site/i },
    { label: 'sibling-context', pattern: /sibling-context/i },
  ];

  const files = collectFiles(outDir, ['.html', '.js', '.css', '.txt']);
  const violations: string[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (let lineno = 1; lineno <= lines.length; lineno++) {
      const line = lines[lineno - 1];
      for (const { label, pattern } of forbidden) {
        if (pattern.test(line)) {
          const rel = path.relative(ROOT, filePath);
          violations.push(`${rel}:${lineno}: brand-independence: found '${label}'`);
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('FAIL: brand-independence check found forbidden branding in static site output');
    for (const v of violations) {
      console.error(v);
    }
    process.exit(1);
  }
  log('brand-independence: static site output is clean of forbidden branding');
}

function main() {
  // Verify required files
  for (const relativePath of required) {
    const fullPath = path.join(ROOT, relativePath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      fail(`missing required backbone file: ${relativePath}`);
    }
    log(relativePath);
  }

  // Wording checks in README.md
  const readmeText = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
  if (!readmeText.includes('repo-owned')) fail('README must keep repo-owned vocabulary');
  if (!readmeText.includes('host-product-only')) fail('README must keep host-product-only vocabulary');
  if (!readmeText.includes('unsupported-or-out-of-scope')) fail('README must keep unsupported-or-out-of-scope vocabulary');

  // Wording checks in docs/confirmed-surfaces.md
  const confirmedSurfacesText = fs.readFileSync(path.join(ROOT, 'docs', 'confirmed-surfaces.md'), 'utf-8');
  if (!confirmedSurfacesText.includes('AGENTS.md')) fail('confirmed surfaces doc must mention AGENTS.md');
  if (!confirmedSurfacesText.includes('.cursor/rules')) fail('confirmed surfaces doc must mention .cursor/rules');

  // Fallback policy checks
  const fallbackPolicyText = fs.readFileSync(path.join(ROOT, 'docs', 'archive', 'fallback-policy.md'), 'utf-8');
  if (!fallbackPolicyText.includes('unsupported-or-out-of-scope')) fail('fallback policy must keep unsupported-or-out-of-scope wording');
  if (!fallbackPolicyText.includes('host-product-only')) fail('fallback policy must keep host-product-only wording');

  // References check
  const referencesText = fs.readFileSync(path.join(ROOT, 'docs', 'references.md'), 'utf-8');
  if (!referencesText.includes('docs.cursor.com/en/cli/using')) fail('references doc must keep Cursor CLI source link');
  if (!referencesText.includes('nextjs.org/docs/app/building-your-application/deploying/static-exports')) fail('references doc must keep Next.js static export source link');
  if (!referencesText.includes('docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages')) fail('references doc must keep GitHub Pages workflow source link');

  // Brand-independence check on static site output
  checkBrandIndependence();

  // Overclaim scan
  const filesToScan = [
    path.join(ROOT, 'AGENTS.md'),
    path.join(ROOT, 'README.md'),
    ...fs.readdirSync(path.join(ROOT, 'docs'))
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(ROOT, 'docs', f))
  ];

  const subject = '(?:oh-my-cursor|this repo|this repository|the repo|this backbone|the backbone|repository|repo)';
  const verb = '(?:ships?|provides?|includes?|owns?|supports?|provisions?|configures?)';
  const patterns: Record<string, RegExp> = {
    'repo-file custom modes': new RegExp(`\\b${subject}\\b.{0,80}\\b${verb}\\b.{0,80}\\brepo[- ](?:file|native)\\b.{0,60}\\bcustom modes?\\b`, 'i'),
    'repo-file background agents': new RegExp(`\\b${subject}\\b.{0,80}\\b${verb}\\b.{0,80}\\brepo[- ](?:file|native)\\b.{0,60}\\bbackground[- ]agents?\\b`, 'i'),
    'default checked-in mcp config': new RegExp(`\\b${subject}\\b.{0,80}\\b${verb}\\b.{0,80}\\b(?:default|checked[- ]in|repo[- ]owned)\\b.{0,40}(?:\\.cursor/mcp\\.json|mcp config)\\b`, 'i'),
  };

  const negations = [
    'does not',
    'do not',
    'not ',
    'without',
    'unless',
    'unsupported',
    'out-of-scope',
    'not currently',
    'not yet',
    'avoid',
    'left opt-in',
    'unclaimed',
  ];

  const violations: string[] = [];
  for (const filePath of filesToScan) {
    const text = fs.readFileSync(filePath, 'utf-8');
    const lines = text.split(/\r?\n/);
    for (let lineno = 1; lineno <= lines.length; lineno++) {
      const rawLine = lines[lineno - 1];
      const line = rawLine.toLowerCase().split(/\s+/).join(' ');
      if (!line || negations.some(neg => line.includes(neg))) {
        continue;
      }
      for (const [label, pattern] of Object.entries(patterns)) {
        if (pattern.test(line)) {
          const rel = path.relative(ROOT, filePath);
          violations.push(`${rel}:${lineno}: ${label}: ${rawLine.trim()}`);
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('FAIL: positive overclaim scan found unsupported repo-owned wording');
    for (const v of violations) {
      console.error(v);
    }
    process.exit(1);
  }
  log('positive overclaim scan stayed clean for README/AGENTS/docs notes');

  // Run child validators
  const runValidator = (cmd: string) => {
    try {
      execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    } catch (err: any) {
      fail(`validator command failed: ${cmd}. Error: ${err.message}`);
    }
  };

  runValidator('node --experimental-strip-types scripts/rule-doctor.ts');
  runValidator('node --experimental-strip-types scripts/validate-plugin-structure.ts');
  runValidator('node --experimental-strip-types scripts/validate-public-language.ts');
  runValidator('node --experimental-strip-types scripts/validate-cursor-workflow-artifacts.ts');
  runValidator('node --experimental-strip-types scripts/validate-surface-inventory.ts');
  runValidator('node --experimental-strip-types scripts/smoke-workflow-state-completion.ts');
  runValidator('node --experimental-strip-types scripts/validate-agent-model-policy.ts');
  runValidator('node --experimental-strip-types scripts/validate-agent-bridge-contract.ts');
  runValidator('node --experimental-strip-types scripts/validate-hook-readonly.ts');
  runValidator('node --experimental-strip-types scripts/validate-hook-readonly.ts --check-shared-lock');
  runValidator('node --experimental-strip-types scripts/validate-translation-freshness.ts');
  runValidator('node --experimental-strip-types scripts/validate-mcp-server-structure.ts');
  runValidator('node --experimental-strip-types scripts/e2e-qa-session-assets.ts');

  console.log('verification: repository backbone files, claim vocabulary, and positive overclaim protections are present');
  process.exit(0);
}

main();
