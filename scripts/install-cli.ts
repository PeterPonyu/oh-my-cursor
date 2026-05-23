import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function usage() {
  console.log(`Usage: node --experimental-strip-types scripts/install-cli.ts [--symlink|--copy] [--with-mcp] [--force]

Oh My Cursor (OMCS) guided installer CLI:
  - Checks Node.js version and environment compatibility
  - Deploys plugin files to Cursor's local plugins directory
  - Registers the MCP state bridge server template (optional via --with-mcp)`);
}

function runCommand(cmd: string): { success: boolean; stdout: string } {
  try {
    const stdout = execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return { success: true, stdout: stdout.trim() };
  } catch {
    return { success: false, stdout: '' };
  }
}

async function main() {
  const args = process.argv.slice(2);
  let symlink = false;
  let force = false;
  let withMcp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--symlink') {
      symlink = true;
    } else if (arg === '--copy') {
      symlink = false;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--with-mcp') {
      withMcp = true;
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      console.error(`FAIL: Unknown option: ${arg}`);
      usage();
      process.exit(1);
    }
  }

  console.log('----------------------------------------------------');
  console.log('   Oh My Cursor (OMCS) Guided Installer CLI         ');
  console.log('----------------------------------------------------');

  // 1. Environment and Compatibility Checks
  console.log('-> Running compatibility checks...');
  
  // Node.js version check
  const nodeVer = process.version;
  console.log(`ok: Node.js version: ${nodeVer}`);
  const match = nodeVer.match(/^v(\d+)\./);
  if (match) {
    const major = parseInt(match[1], 10);
    if (major < 18) {
      console.warn('WARNING: Node.js version is below v18. Some features may not behave correctly.');
    }
  }

  // OS check
  const platform = os.platform();
  console.log(`ok: Operating system platform: ${platform}`);

  // Git repository check
  const gitCheck = runCommand('git rev-parse --is-inside-work-tree');
  if (gitCheck.success && gitCheck.stdout === 'true') {
    console.log('ok: Git repository detected.');
  } else {
    console.warn('WARNING: Not inside a git worktree. Drift features may be limited.');
  }

  // 2. Cursor CLI / Application Checks
  const cursorCheck = runCommand('which cursor-agent || which cursor');
  if (cursorCheck.success) {
    console.log(`ok: Cursor application path detected: ${cursorCheck.stdout}`);
  } else {
    console.log('NOTE: Cursor binary not found in PATH (normal if running headless or without CLI installed).');
  }

  // 3. Delegate execution to core installer script
  console.log('\n-> Initiating plugin deployment...');
  
  const modeFlag = symlink ? '--symlink' : '--copy';
  const mcpFlag = withMcp ? '--with-mcp' : '';
  const forceFlag = force ? '--force' : '';
  
  const cmd = `node --experimental-strip-types scripts/install-local-plugin.ts ${modeFlag} ${mcpFlag} ${forceFlag}`;
  console.log(`Executing: ${cmd}`);

  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    console.log('\nok: Plugin deployment completed successfully.');
  } catch (err: any) {
    console.error(`\nFAIL: Deployment script failed: ${err.message}`);
    process.exit(1);
  }

  // 4. Print post-installation instructions
  console.log('\n----------------------------------------------------');
  console.log('   Deployment Successful! Next Steps:               ');
  console.log('----------------------------------------------------');
  console.log('1. Restart Cursor to load your newly installed plugin.');
  console.log('2. Check your configuration file at `.cursor/config.json`.');
  console.log('3. Run the Autopilot loop to automate tasks:');
  console.log('   node --experimental-strip-types scripts/run-autopilot.ts');
  if (withMcp) {
    console.log('4. The cursor-state-bridge MCP server has been templates.');
    console.log('   Register it in Cursor Settings > Features > MCP.');
  }
  console.log('----------------------------------------------------\n');
}

main().catch(err => {
  console.error(`FAIL: Unexpected error during installation: ${err.message}`);
  process.exit(1);
});
