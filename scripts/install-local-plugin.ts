import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(currentFile), '..');

let sourceRoot = REPO_ROOT;
let targetRoot = path.join(os.homedir(), '.cursor', 'plugins', 'local');
let pluginName = 'oh-my-cursor';
let mode: 'copy' | 'symlink' = 'copy';
let force = false;
let withMcp = false;
let action: 'install' | 'status' | 'uninstall' | 'watch' = 'install';

const LEGACY_PLUGIN_NAMES = ['oh-my-copilot-workspace'];

function log(msg: string): void {
  console.log(`ok: ${msg}`);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function usage() {
  console.log(`
Usage: node --experimental-strip-types scripts/install-local-plugin.ts [ACTION] [--root PATH] [--target-root PATH] [--name NAME] [--copy|--symlink] [--force] [--with-mcp]

Installs a Cursor plugin source tree into Cursor's local plugin directory.

Defaults:
  - mode: copy (minimal payload only)
  - target root: ~/.cursor/plugins/local
  - plugin name: oh-my-cursor

Actions:
  --status      Show installed plugin info
  --uninstall   Remove the plugin and any legacy aliases
  --watch       Watch for changes and auto-re-copy
`);
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
    } else if (arg === '--copy') {
      mode = 'copy';
    } else if (arg === '--symlink') {
      mode = 'symlink';
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--with-mcp') {
      withMcp = true;
    } else if (arg === '--status') {
      action = 'status';
    } else if (arg === '--uninstall') {
      action = 'uninstall';
    } else if (arg === '--watch') {
      action = 'watch';
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
}

function shouldCopy(relPath: string, withMcpOption: boolean): boolean {
  const parts = relPath.split(path.sep);
  if (
    parts.includes('__pycache__') ||
    parts.includes('.pytest_cache') ||
    parts.includes('.git') ||
    parts.includes('.omc') ||
    parts.includes('.omcs') ||
    parts.includes('node_modules')
  ) {
    return false;
  }
  const basename = parts[parts.length - 1];
  if (
    basename.endsWith('.pyc') ||
    basename.endsWith('.lock') ||
    basename === '.DS_Store' ||
    basename.endsWith('.swp') ||
    basename.endsWith('~')
  ) {
    return false;
  }

  if (relPath.startsWith('.cursor/memories')) return false;
  if (relPath === '.cursor/mcp.json') return false;
  if (relPath === '.cursor/state/workflow-state.json') return false;
  if (relPath === '.cursor/state/active-role.json') return false;
  if (relPath.startsWith('hooks/state/')) return false;

  if (relPath.startsWith('mcp')) {
    if (!withMcpOption) return false;
    if (parts.includes('tests')) return false;
  }
  if (relPath === 'mcp.json' && !withMcpOption) return false;

  return true;
}

function copyPayload(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  const walk = (currentDir: string) => {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullSrc = path.join(currentDir, item);
      const rel = path.relative(src, fullSrc);
      const stat = fs.statSync(fullSrc);
      if (!shouldCopy(rel, withMcp)) {
        continue;
      }
      const fullDst = path.join(dst, rel);
      if (stat.isDirectory()) {
        fs.mkdirSync(fullDst, { recursive: true });
        walk(fullSrc);
      } else {
        fs.mkdirSync(path.dirname(fullDst), { recursive: true });
        fs.copyFileSync(fullSrc, fullDst);
      }
    }
  };
  walk(src);

  if (!withMcp) {
    const pluginJsonPath = path.join(dst, '.cursor-plugin', 'plugin.json');
    if (fs.existsSync(pluginJsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
        delete data.mcpServers;
        fs.writeFileSync(pluginJsonPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      } catch {
        // ignore
      }
    }
  }
}

function validatePrebuiltPayload(src: string) {
  const manifest = path.join(src, '.cursor-plugin', 'plugin.json');
  if (!fs.existsSync(manifest)) {
    fail('prebuilt payload is missing .cursor-plugin/plugin.json');
  }

  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(manifest, 'utf-8'));
  } catch (err: any) {
    fail(`failed to parse plugin.json: ${err.message}`);
  }

  const missing = ['name', 'displayName', 'version'].filter(k => !data[k]);
  if (missing.length > 0) {
    fail(`manifest missing required fields: ${missing.join(', ')}`);
  }

  for (const key of ['rules', 'skills', 'agents', 'hooks', 'mcpServers']) {
    const val = data[key];
    if (val && !fs.existsSync(path.join(src, val))) {
      fail(`manifest ${key} references missing path: ${val}`);
    }
  }

  if (data.mcpServers && !fs.existsSync(path.join(src, 'mcp'))) {
    fail('manifest mcpServers is present but mcp/ is missing');
  }

  const requiredPaths = [
    'AGENTS.md',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'assets',
    'rules',
    'skills',
    'agents',
    'hooks/hooks.json',
    'hooks',
    '.cursor/mcp.example.json',
    '.cursor/rules',
    '.cursor/state',
    'src',
  ];

  for (const rp of requiredPaths) {
    if (!fs.existsSync(path.join(src, rp))) {
      fail(`prebuilt payload is missing ${rp}`);
    }
  }

  // Check dev artifacts
  const checkDev = (dir: string) => {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (item === '__pycache__' || item === '.pytest_cache') {
          fail(`prebuilt payload contains dev artifact directory: ${item}`);
        }
        checkDev(full);
      } else {
        if (item.endsWith('.pyc') || item.endsWith('.lock')) {
          fail(`prebuilt payload contains dev artifact file: ${item}`);
        }
      }
    }
  };
  checkDev(src);

  log(`validated prebuilt plugin payload at ${src}`);
}

function validateSourceRoot(src: string) {
  const valScript = path.join(src, 'scripts', 'validate-plugin-structure.ts');
  if (fs.existsSync(valScript)) {
    try {
      execSync(`node --experimental-strip-types "${valScript}"`, { cwd: src, stdio: 'ignore' });
      log(`validated repo-root plugin structure at ${src}`);
      return;
    } catch (err: any) {
      fail(`validation failed: ${err.message}`);
    }
  }
  validatePrebuiltPayload(src);
}

function cleanupLegacyAliases(target: string) {
  if (pluginName !== 'oh-my-cursor') return;
  for (const legacyName of LEGACY_PLUGIN_NAMES) {
    const legacyPath = path.join(target, legacyName);
    if (fs.existsSync(legacyPath)) {
      fs.rmSync(legacyPath, { recursive: true, force: true });
      log(`removed legacy local plugin alias at ${legacyPath}`);
    }
  }

  if (!withMcp) {
    const targetPath = path.join(target, pluginName);
    try {
      const stat = fs.lstatSync(targetPath);
      if (stat.isSymbolicLink()) {
        log(`skipped stale mcp/ cleanup for symlink install at ${targetPath}`);
        return;
      }
    } catch {
      return;
    }
    const staleMcp = path.join(targetPath, 'mcp');
    if (fs.existsSync(staleMcp)) {
      fs.rmSync(staleMcp, { recursive: true, force: true });
      log(`removed stale mcp/ tree from previous --with-mcp install at ${staleMcp}`);
    }
  }
}

function doStatus() {
  const targetPath = path.join(targetRoot, pluginName);
  if (!fs.existsSync(targetPath)) {
    console.log(`not installed: ${targetPath} does not exist`);
    process.exit(0);
  }

  const manifest = path.join(targetPath, '.cursor-plugin', 'plugin.json');
  if (!fs.existsSync(manifest)) {
    console.log(`broken install: ${targetPath} exists but is missing .cursor-plugin/plugin.json`);
    process.exit(0);
  }

  let installedVersion = 'unknown';
  try {
    installedVersion = JSON.parse(fs.readFileSync(manifest, 'utf-8')).version || 'unknown';
  } catch {}

  const repoManifest = path.join(sourceRoot, '.cursor-plugin', 'plugin.json');
  let repoVersion = 'unknown';
  if (fs.existsSync(repoManifest)) {
    try {
      repoVersion = JSON.parse(fs.readFileSync(repoManifest, 'utf-8')).version || 'unknown';
    } catch {}
  }

  let installedMode = 'copy';
  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      installedMode = `symlink (${fs.readlinkSync(targetPath)})`;
    }
  } catch {}

  const getFileCount = (dir: string): number => {
    let count = 0;
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else {
          count++;
        }
      }
    };
    walk(dir);
    return count;
  };

  const fileCount = getFileCount(targetPath);
  const stale = installedVersion !== repoVersion ? ` (stale: repo has ${repoVersion})` : '';

  console.log(`installed: ${targetPath}`);
  console.log(`  version: ${installedVersion}${stale}`);
  console.log(`  mode:    ${installedMode}`);
  console.log(`  files:   ${fileCount}`);
}

function doUninstall() {
  const targetPath = path.join(targetRoot, pluginName);
  if (!fs.existsSync(targetPath)) {
    log(`nothing to uninstall at ${targetPath}`);
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
  log(`removed plugin at ${targetPath}`);
  cleanupLegacyAliases(targetRoot);
}

function doWatch() {
  if (mode === 'symlink') {
    fail('--watch requires copy mode; symlink mode already reflects repo changes live');
  }

  const targetPath = path.join(targetRoot, pluginName);
  fs.mkdirSync(targetRoot, { recursive: true });
  cleanupLegacyAliases(targetRoot);
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(targetPath, { recursive: true });
  copyPayload(sourceRoot, targetPath);
  log(`initial install complete — watching for changes`);

  let debounceTimer: NodeJS.Timeout | null = null;
  const watchCallback = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
        fs.mkdirSync(targetPath, { recursive: true });
        copyPayload(sourceRoot, targetPath);
        console.log('Re-copied payload — reload Cursor to see changes');
      } catch (err: any) {
        console.error(`Re-copy failed: ${err.message}`);
      }
    }, 500);
  };

  fs.watch(sourceRoot, { recursive: true }, (event, filename) => {
    if (filename) {
      const rel = path.relative(sourceRoot, path.join(sourceRoot, filename));
      if (shouldCopy(rel, withMcp)) {
        watchCallback();
      }
    }
  });

  process.on('SIGINT', () => {
    console.log('\nStopped watching.');
    process.exit(0);
  });
}

function main() {
  parseArgs();

  if (action === 'status') {
    validateSourceRoot(sourceRoot);
    doStatus();
    process.exit(0);
  }

  if (action === 'uninstall') {
    doUninstall();
    process.exit(0);
  }

  if (action === 'watch') {
    validateSourceRoot(sourceRoot);
    if (withMcp && !fs.existsSync(path.join(sourceRoot, 'mcp'))) {
      fail('--with-mcp requested but source root has no mcp/ tree');
    }
    doWatch();
    // keeps running
    return;
  }

  validateSourceRoot(sourceRoot);
  if (withMcp && !fs.existsSync(path.join(sourceRoot, 'mcp'))) {
    fail('--with-mcp requested but source root has no mcp/ tree');
  }

  const targetPath = path.join(targetRoot, pluginName);
  fs.mkdirSync(targetRoot, { recursive: true });
  cleanupLegacyAliases(targetRoot);

  if (fs.existsSync(targetPath)) {
    if (!force) {
      try {
        const stat = fs.lstatSync(targetPath);
        if (stat.isSymbolicLink() && fs.readlinkSync(targetPath) === sourceRoot) {
          log(`local plugin path already points at this repository: ${targetPath}`);
          process.exit(0);
        }
      } catch {}
      fail(`target already exists at ${targetPath} (use --force to replace it)`);
    }
  }

  if (mode === 'symlink') {
    if (force) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
    fs.symlinkSync(sourceRoot, targetPath);
    log(`symlinked plugin into ${targetPath}`);
  } else {
    if (force) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
    fs.mkdirSync(targetPath, { recursive: true });
    copyPayload(sourceRoot, targetPath);
    log(`copied minimal runtime plugin payload into ${targetPath}`);
  }

  const manifest = path.join(targetPath, '.cursor-plugin', 'plugin.json');
  if (!fs.existsSync(manifest)) {
    fail(`installed plugin is missing .cursor-plugin/plugin.json`);
  }
  log('installed plugin root contains .cursor-plugin/plugin.json');

  console.log(`next: reload Cursor or use Developer: Reload Window`);
  console.log(`next: confirm rules/skills/hooks/agents are visible from ${targetPath}`);
}

main();
