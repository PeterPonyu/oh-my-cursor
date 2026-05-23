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

function gitLsFiles(pattern: string): string[] {
  try {
    const stdout = execSync(`git ls-files "${pattern}"`, { cwd: ROOT, encoding: 'utf-8' });
    return stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const args = process.argv.slice(2);

  // Self-test mode check
  if (args.includes('--self-test')) {
    console.log('self-test: tracked mcp.json detection');
    const trackedMcp = gitLsFiles('.cursor/mcp.json');
    if (trackedMcp.length > 0) {
      fail('self-test: real repo has tracked .cursor/mcp.json (unexpected)');
    }
    console.log('self-test: no tracked .cursor/mcp.json — passes negative case');
    console.log('self-test: mcp.json present check');
    if (!fs.existsSync(path.join(ROOT, 'mcp.json'))) {
      fail('self-test: missing mcp.json');
    }
    console.log('VALIDATE_PLUGIN_STRUCTURE_SELF_TEST_OK');
    process.exit(0);
  }

  const required = [
    '.cursor-plugin/plugin.json',
    'hooks/hooks.json',
    'hooks/README.md',
    'hooks/claim-guard.ts',
    'hooks/stop-gate.ts',
    'hooks/_active_role.ts',
    'hooks/_tool_payload.ts',
    '.cursor/mcp.example.json',
    '.cursor/state/_locking.ts',
    '.cursor/state/workflow-state.schema.json',
    '.cursor/state/workflow-state.example.json',
    '.cursor/state/workflow-state.ts',
    '.cursor/state/README.md',
    'src/oh_my_cursor/workflow_state/api.ts',
    'src/oh_my_cursor/workflow_state/cli.ts',
    'src/oh_my_cursor/workflow_state/locking.ts',
    'src/oh_my_cursor/workflow_state/index.ts',
    'agents/architect.md',
    'agents/code-reviewer.md',
    'agents/critic.md',
    'agents/debugger.md',
    'agents/explore.md',
    'agents/implementer.md',
    'agents/orchestrator.md',
    'agents/planner.md',
    'agents/qa-tester.md',
    'agents/researcher.md',
    'agents/security-reviewer.md',
    'agents/test-engineer.md',
    'agents/tracer.md',
    'agents/verifier.md',
    'mcp.json',
    '.cursor/rules/00-repo-scope.mdc',
    '.cursor/rules/10-docs-claims.mdc',
    'rules/repo-owned-plugin-boundary.mdc',
    '.cursor/rules/20-commit-discipline.mdc',
    '.cursor/rules/30-error-handling.mdc',
    'skills/local-plugin-check/SKILL.md',
    'skills/phase-controller/SKILL.md',
    'skills/team-controller/SKILL.md',
    'docs/local-plugin-verification.md',
    'docs/orchestration.md',
    'docs/PR-POLICY.md',
    'CHANGELOG.md',
    'scripts/install-local-plugin.ts',
    'scripts/check-local-plugin-install.ts',
    'scripts/validate-cursor-workflow-artifacts.ts',
    'scripts/smoke-cursor-workflow-artifacts.ts',
    'scripts/smoke-workflow-state-completion.ts',
    'scripts/validate-workflow-state.ts',
    'scripts/workflow-state.ts',
    'scripts/run-team-coordinator.ts',
  ];

  for (const f of required) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      fail(`missing required plugin file: ${f}`);
    }
    log(f);
  }

  // Check .cursor/mcp.json is not tracked
  const trackedMcp = gitLsFiles('.cursor/mcp.json');
  if (trackedMcp.length > 0) {
    fail('tracked .cursor/mcp.json is forbidden; use .cursor/mcp.example.json instead');
  }
  log('.cursor/mcp.json is not tracked (correct)');

  // Clean runtime artifacts
  let contaminated = false;
  
  const trackedBad = gitLsFiles('.cursor').concat(gitLsFiles('mcp')).filter(f => 
    f.includes('__pycache__') || f.includes('.pytest_cache') || f.endsWith('.pyc')
  );
  if (trackedBad.length > 0) {
    console.error('FAIL: cache files are tracked in git:', trackedBad);
    contaminated = true;
  }

  const checkDirs = [
    path.join(ROOT, '.cursor', 'state'),
    path.join(ROOT, 'hooks', 'state'),
    path.join(ROOT, '.cursor', 'memories')
  ];

  for (const dir of checkDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      if (dir.endsWith('state') && files.some(f => f.endsWith('.lock'))) {
        console.error(`FAIL: found *.lock files in ${path.relative(ROOT, dir)}`);
        contaminated = true;
      }
    }
  }

  if (fs.existsSync(path.join(ROOT, '.cursor', 'state', 'workflow-state.json'))) {
    console.error('FAIL: found .cursor/state/workflow-state.json runtime artifact');
    contaminated = true;
  }
  if (fs.existsSync(path.join(ROOT, '.cursor', 'state', 'active-role.json'))) {
    console.error('FAIL: found .cursor/state/active-role.json runtime artifact');
    contaminated = true;
  }
  if (fs.existsSync(path.join(ROOT, '.cursor', 'memories'))) {
    console.error('FAIL: found .cursor/memories/ runtime directory');
    contaminated = true;
  }
  if (fs.existsSync(path.join(ROOT, 'hooks', 'state'))) {
    console.error('FAIL: found hooks/state/ runtime directory');
    contaminated = true;
  }

  if (!contaminated) {
    log('payload is clean: no __pycache__, .pytest_cache, *.pyc, *.lock, or runtime artifacts in .cursor/');
  } else {
    fail('contaminated files or runtime artifacts found');
  }

  // Validate manifest
  const manifestPath = path.join(ROOT, '.cursor-plugin', 'plugin.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const name = manifest.name;
  if (name !== 'oh-my-cursor') {
    fail(`plugin manifest name must be 'oh-my-cursor', got ${name}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    fail('plugin manifest name must be lowercase kebab-case');
  }
  if (typeof manifest.description !== 'string' || !manifest.description.trim()) {
    fail('plugin manifest must include a non-empty description');
  }
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    fail('plugin manifest must include a non-empty version');
  }
  if (!manifest.author || typeof manifest.author.name !== 'string' || !manifest.author.name.trim()) {
    fail('plugin manifest must include author.name');
  }

  const expectedPaths = {
    mcpServers: 'mcp.json',
  };
  for (const [key, expected] of Object.entries(expectedPaths)) {
    if (manifest[key] !== expected) {
      fail(`plugin manifest must set ${key} to ${expected}, got ${manifest[key]}`);
    }
  }

  const discoveryDefaults = {
    rules: 'rules',
    skills: 'skills',
    agents: 'agents',
    hooks: 'hooks/hooks.json',
  };
  for (const [key, expected] of Object.entries(discoveryDefaults)) {
    if (manifest[key] !== undefined && manifest[key] !== expected) {
      fail(`plugin manifest overrides default ${key} path (${manifest[key]}); remove override or use default ${expected}`);
    }
  }
  log('plugin manifest fields are present and well-formed');

  // Count checks
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

  const cursorRulesCount = getFileCount(path.join(ROOT, '.cursor', 'rules'), /\.(md|mdc|markdown)$/);
  const rulesCount = getFileCount(path.join(ROOT, 'rules'), /\.(md|mdc|markdown)$/);
  const skillsCount = getFileCount(path.join(ROOT, 'skills'), /^SKILL\.md$/);
  const hooksCount = fs.existsSync(path.join(ROOT, 'hooks', 'hooks.json')) ? 1 : 0;
  const agentsCount = getFileCount(path.join(ROOT, 'agents'), /\.md$/);

  if (cursorRulesCount < 4) fail('expected the four Cursor workspace rules');
  if (rulesCount < 1) fail('expected at least one plugin-boundary compatibility rule');
  if (skillsCount < 1) fail('expected at least one plugin-owned skill');
  if (hooksCount !== 1) fail('expected exactly one project hook manifest');
  if (agentsCount < 12) fail('expected at least twelve checked-in project agents');

  log(`Cursor workspace rule count is ${cursorRulesCount}`);
  log(`plugin-boundary compatibility rule count is ${rulesCount}`);
  log(`plugin-owned skill count is ${skillsCount}`);
  log(`project hook manifest count is ${hooksCount}`);
  log(`checked-in project agent count is ${agentsCount}`);

  // Run child validators
  try {
    execSync('node --experimental-strip-types scripts/validate-cursor-workflow-artifacts.ts', { cwd: ROOT, stdio: 'inherit' });
    execSync('node --experimental-strip-types scripts/validate-workflow-state.ts', { cwd: ROOT, stdio: 'ignore' });
  } catch (err: any) {
    fail(`child validators failed: ${err.message}`);
  }

  // Doc text grep assertions
  const readmeText = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
  if (!readmeText.includes('.cursor-plugin/plugin.json')) fail('README must mention the repo-root plugin manifest');
  if (!readmeText.includes('~/.cursor/plugins/local/oh-my-cursor')) fail('README must mention the local plugin path');
  if (!readmeText.includes('scripts/install-local-plugin.ts')) fail('README must mention the local plugin install helper');
  if (!readmeText.includes('scripts/check-local-plugin-install.ts')) fail('README must mention the CI-safe install check');

  const docText = fs.readFileSync(path.join(ROOT, 'docs', 'local-plugin-verification.md'), 'utf-8');
  if (!docText.includes('.cursor-plugin/plugin.json')) fail('local plugin verification doc must mention the manifest');
  if (!docText.includes('~/.cursor/plugins/local/oh-my-cursor')) fail('local plugin verification doc must mention the local plugin path');
  if (!docText.includes('scripts/install-local-plugin.ts')) fail('local plugin verification doc must mention the install helper');
  if (!docText.includes('scripts/check-local-plugin-install.ts')) fail('local plugin verification doc must mention the CI-safe install check');

  log('plugin docs mention the manifest and local plugin load path');
}

main();
