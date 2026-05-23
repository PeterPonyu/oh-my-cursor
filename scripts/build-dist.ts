import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const PLUGIN_NAME = 'oh-my-cursor';
const DIST_DIR = path.join(ROOT, 'dist');

function usage() {
  console.log(`Usage: node --experimental-strip-types scripts/build-dist.ts [--with-mcp] [--clean]

Builds a clean distribution payload into dist/.

This script:
  1. Validates the plugin structure
  2. Removes any stale dist/ directory
  3. Copies only the minimal runtime payload (no dev artifacts)
  4. Optionally includes the MCP server

Flags:
  --with-mcp  Include the mcp/ tree in the payload
  --clean     Remove dist/ and exit without building`);
}

function log(msg: string) {
  console.log(`ok: ${msg}`);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function copyFiltered(src: string, dest: string, withMcp: boolean) {
  function shouldInclude(relPath: string, isDir: boolean): boolean {
    const parts = relPath.split('/');
    if (parts.some(p => p === '__pycache__' || p === '.pytest_cache' || p === 'node_modules')) return false;
    if (parts.some(p => p.endsWith('.pyc') || p.endsWith('.lock') || p === '.DS_Store' || p.endsWith('.swp') || p.endsWith('~'))) return false;

    if (relPath.startsWith('.cursor/memories')) return false;
    if (relPath === '.cursor/mcp.json') return false;
    if (relPath === '.cursor/state/workflow-state.json') return false;
    if (relPath === '.cursor/state/active-role.json') return false;
    if (relPath.startsWith('hooks/state/')) return false;

    if (relPath.startsWith('mcp/')) {
      if (parts.some(p => p === 'tests')) return false;
      return withMcp;
    }
    if (relPath === 'mcp.json') {
      return withMcp;
    }

    if (relPath.startsWith('.cursor-plugin')) return true;
    if (relPath === '.cursor/mcp.example.json') return true;
    if (relPath.startsWith('.cursor/rules')) return true;
    if (relPath.startsWith('hooks')) return true;
    if (relPath.startsWith('agents')) return true;
    if (relPath.startsWith('.cursor/state')) return true;
    if (relPath.startsWith('src')) return true;
    if (relPath.startsWith('rules')) return true;
    if (relPath.startsWith('skills')) return true;
    if (relPath === 'AGENTS.md') return true;
    if (relPath === 'README.md') return true;
    if (relPath.startsWith('assets')) return true;
    if (relPath === 'CHANGELOG.md') return true;
    if (relPath === 'LICENSE') return true;

    if (isDir) {
      if (relPath === '.cursor') return true;
      if (relPath === '') return true;
    }

    return false;
  }

  function walk(currentSrc: string, currentDest: string) {
    const stat = fs.statSync(currentSrc);
    if (stat.isDirectory()) {
      const items = fs.readdirSync(currentSrc);
      for (const item of items) {
        const itemSrc = path.join(currentSrc, item);
        const itemRel = path.relative(src, itemSrc).replace(/\\/g, '/');
        const itemStat = fs.statSync(itemSrc);
        if (shouldInclude(itemRel, itemStat.isDirectory())) {
          if (itemStat.isDirectory()) {
            const itemDest = path.join(currentDest, item);
            fs.mkdirSync(itemDest, { recursive: true });
            walk(itemSrc, itemDest);
          } else {
            const itemDest = path.join(currentDest, item);
            fs.mkdirSync(path.dirname(itemDest), { recursive: true });
            fs.copyFileSync(itemSrc, itemDest);
          }
        }
      }
    }
  }

  walk(src, dest);
}

function countFiles(dir: string): number {
  let count = 0;
  function walk(d: string) {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        count++;
      }
    }
  }
  walk(dir);
  return count;
}

function main() {
  const args = process.argv.slice(2);
  let withMcp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--with-mcp') {
      withMcp = true;
    } else if (arg === '--clean') {
      if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
      }
      log(`removed ${DIST_DIR}`);
      process.exit(0);
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      console.error(`FAIL: unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  // Validate plugin structure first
  try {
    execSync('node --experimental-strip-types scripts/validate-plugin-structure.ts', { cwd: ROOT, stdio: 'ignore' });
    log('plugin structure validated');
  } catch (err: any) {
    fail(`plugin structure validation failed: ${err.message}`);
  }

  // Clean stale dist
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const destPluginDir = path.join(DIST_DIR, PLUGIN_NAME);
  fs.mkdirSync(destPluginDir, { recursive: true });

  copyFiltered(ROOT, destPluginDir, withMcp);

  // If --with-mcp is not set, modify plugin.json to remove mcpServers field
  if (!withMcp) {
    const destManifestPath = path.join(destPluginDir, '.cursor-plugin', 'plugin.json');
    if (fs.existsSync(destManifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(destManifestPath, 'utf-8'));
      delete manifest.mcpServers;
      fs.writeFileSync(destManifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    }
  }

  // Check for dev artifacts
  const checkWalk = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (f === '__pycache__' || f === '.pytest_cache') {
          fail(`dist/ contains dev artifacts directory: ${full}`);
        }
        checkWalk(full);
      } else {
        if (f.endsWith('.pyc') || f.endsWith('.lock')) {
          fail(`dist/ contains dev artifact file: ${full}`);
        }
      }
    }
  };
  checkWalk(DIST_DIR);

  const fileCount = countFiles(destPluginDir);
  log(`built dist/${PLUGIN_NAME} with ${fileCount} files`);

  if (withMcp) {
    log('mcp/ included in payload');
  } else {
    log('mcp/ excluded (use --with-mcp to include)');
  }

  console.log(`next: inspect dist/${PLUGIN_NAME}/`);
  console.log(`next: install bundled payload with: node --experimental-strip-types scripts/install-local-plugin.ts --root dist/${PLUGIN_NAME} --force`);
  process.exit(0);
}

main();
