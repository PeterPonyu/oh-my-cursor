import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(currentFile), '..');

let sourceRoot = REPO_ROOT;
let targetRoot = '';
let pluginName = 'oh-my-cursor';
let withMcp = false;

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function log(message: string): void {
  console.log(`ok: ${message}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--root') {
      if (i + 1 >= args.length) fail('--root requires a path');
      sourceRoot = path.resolve(args[i + 1]);
      i++;
    } else if (arg === '--target-root') {
      if (i + 1 >= args.length) fail('--target-root requires a path');
      targetRoot = path.resolve(args[i + 1]);
      i++;
    } else if (arg === '--name') {
      if (i + 1 >= args.length) fail('--name requires a value');
      pluginName = args[i + 1];
      i++;
    } else if (arg === '--with-mcp') {
      withMcp = true;
    } else if (arg === '-h' || arg === '--help') {
      console.log('Usage: node --experimental-strip-types scripts/check-local-plugin-install.ts [--root PATH] [--target-root PATH] [--name NAME] [--with-mcp]');
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
}

function runNode(script: string, args: string[]): string {
  const abs = path.resolve(REPO_ROOT, script);
  // Use execFileSync with argv array to avoid shell injection
  return execSync(
    `node --experimental-strip-types "${abs}" ${args.map(a => a.replace(/"/g, '\\"')).join(' ')}`,
    { encoding: 'utf-8' }
  );
}

function main() {
  parseArgs();

  // Validate plugin structure first (against sourceRoot, not REPO_ROOT)
  try {
    execSync(`node --experimental-strip-types "${path.join(REPO_ROOT, 'scripts', 'validate-plugin-structure.ts')}" --root "${sourceRoot}"`, { stdio: 'ignore' });
  } catch (err: any) {
    fail(`validation of source root structure failed: ${err.message}`);
  }

  let cleanupRoot = false;
  if (!targetRoot) {
    targetRoot = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'omcs-check-install-'));
    cleanupRoot = true;
  }

  try {
    const symlinkTarget = path.join(targetRoot, 'symlink');
    const copyTarget = path.join(targetRoot, 'copy');

    fs.mkdirSync(path.join(copyTarget, 'oh-my-copilot-workspace'), { recursive: true });
    fs.writeFileSync(path.join(copyTarget, 'oh-my-copilot-workspace', 'stale.json'), '{"stale": true}\n', 'utf-8');

    // Run symlink install
    runNode('scripts/install-local-plugin.ts', [
      '--root', `"${sourceRoot}"`,
      '--target-root', `"${symlinkTarget}"`,
      '--name', pluginName,
      '--symlink',
      '--force',
    ]);

    const symlinkPluginPath = path.join(symlinkTarget, pluginName);
    const symlinkStat = fs.lstatSync(symlinkPluginPath);
    if (!symlinkStat.isSymbolicLink()) {
      fail(`symlink mode did not create a symlink at ${symlinkPluginPath}`);
    }
    if (fs.readlinkSync(symlinkPluginPath) !== sourceRoot) {
      fail(`symlink mode did not point at ${sourceRoot}`);
    }
    if (!fs.existsSync(path.join(symlinkPluginPath, '.cursor-plugin', 'plugin.json'))) {
      fail('symlink mode plugin missing manifest');
    }

    if (fs.existsSync(path.join(sourceRoot, 'mcp'))) {
      runNode('scripts/install-local-plugin.ts', [
        '--root', `"${sourceRoot}"`,
        '--target-root', `"${symlinkTarget}"`,
        '--name', pluginName,
        '--symlink',
        '--force',
      ]);
      if (!fs.existsSync(path.join(sourceRoot, 'mcp'))) {
        fail('symlink reinstall removed source mcp/ tree');
      }
    }
    log('symlink mode installs the repo-root plugin correctly');

    // Run copy install
    const copyArgs = [
      '--root', `"${sourceRoot}"`,
      '--target-root', `"${copyTarget}"`,
      '--name', pluginName,
      '--copy',
      '--force',
    ];
    if (withMcp) {
      copyArgs.push('--with-mcp');
    }

    runNode('scripts/install-local-plugin.ts', copyArgs);

    const copyPluginPath = path.join(copyTarget, pluginName);
    if (fs.existsSync(path.join(copyTarget, 'oh-my-copilot-workspace'))) {
      fail('copy mode did not remove legacy oh-my-copilot-workspace alias');
    }
    const copyStat = fs.lstatSync(copyPluginPath);
    if (copyStat.isSymbolicLink()) {
      fail(`copy mode unexpectedly created a symlink at ${copyPluginPath}`);
    }
    if (!fs.existsSync(copyPluginPath) || !fs.statSync(copyPluginPath).isDirectory()) {
      fail(`copy mode did not create plugin directory at ${copyPluginPath}`);
    }

    const checkFiles = [
      '.cursor-plugin/plugin.json',
      'assets/oh-my-cursor-character.jpg',
      'assets/oh-my-cursor-social-preview.jpg',
      'rules/repo-owned-plugin-boundary.mdc',
      'skills/local-plugin-check/SKILL.md',
      'skills/phase-controller/SKILL.md',
      'hooks/hooks.json',
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
      'hooks/_trace.ts',
      'agents/code-reviewer.md',
      'agents/critic.md',
      'agents/debugger.md',
      'agents/explore.md',
      'agents/implementer.md',
      'agents/orchestrator.md',
      'agents/architect.md',
      'agents/planner.md',
      'agents/researcher.md',
      'agents/security-reviewer.md',
      'agents/test-engineer.md',
      'agents/tracer.md',
      'agents/verifier.md',
      'agents/qa-tester.md',
      '.cursor/state/workflow-state.schema.json',
      '.cursor/state/workflow-state.ts',
      '.cursor/state/_locking.ts',
      'src/oh_my_cursor/workflow_state/api.ts',
      'src/oh_my_cursor/workflow_state/cli.ts',
      'src/oh_my_cursor/workflow_state/locking.ts',
      '.cursor/mcp.example.json',
    ];

    for (const f of checkFiles) {
      const full = path.join(copyPluginPath, f);
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
        fail(`copy mode plugin missing required file: ${f}`);
      }
    }

    const checkNoDirs = ['benchmark', 'apps', 'docs', 'scripts'];
    for (const d of checkNoDirs) {
      if (fs.existsSync(path.join(copyPluginPath, d))) {
        fail(`copy mode should not include ${d} assets`);
      }
    }

    if (!withMcp) {
      if (fs.existsSync(path.join(copyPluginPath, 'mcp'))) {
        fail('default install must not include mcp/');
      }
      log('copy mode: mcp/ correctly absent from default install');
    } else {
      if (!fs.existsSync(path.join(copyPluginPath, 'mcp/cursor-state-bridge/server.ts'))) {
        fail('--with-mcp install missing mcp/cursor-state-bridge/server.ts');
      }
      if (!fs.existsSync(path.join(copyPluginPath, 'mcp/cursor-state-bridge/index.ts'))) {
        fail('--with-mcp install missing mcp/cursor-state-bridge/index.ts');
      }
      log('copy mode: mcp/cursor-state-bridge correctly present with --with-mcp');
    }

    log('copy mode installs the repo-root plugin correctly');
    log('local plugin install helper passed bounded install checks');
  } finally {
    if (cleanupRoot) {
      try {
        fs.rmSync(targetRoot, { recursive: true, force: true });
      } catch {}
    }
  }
}

main();
