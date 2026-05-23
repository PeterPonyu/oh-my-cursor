import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const PREFIX = '[OMCS]';

function log(msg: string) {
  console.log(`ok: ${msg}`);
}

function warn(msg: string) {
  console.warn(`WARN: ${msg}`);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function parseFrontmatter(filePath: string): Record<string, string> {
  const text = fs.readFileSync(filePath, 'utf-8');
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    fail(`${path.relative(ROOT, filePath)} missing YAML frontmatter`);
  }
  const match = text.match(/^---(?:\r?\n)([\s\S]*?)(?:\r?\n)---/);
  if (!match) {
    fail(`${path.relative(ROOT, filePath)} has unterminated YAML frontmatter`);
  }
  const fmText = match[1];
  const fields: Record<string, string> = {};
  for (const line of fmText.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    fields[key] = val;
  }
  return fields;
}

function main() {
  // ---- 1. Check plugin.json display name and description prefix ----
  const manifestPath = path.join(ROOT, '.cursor-plugin', 'plugin.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  for (const key of ['displayName', 'description']) {
    const val = String(manifest[key] || '');
    if (!val.startsWith(PREFIX)) {
      fail(`.cursor-plugin/plugin.json ${key} must start with ${PREFIX}`);
    }
  }

  // ---- 2. Check frontmatter description in skills, agents, rules ----
  const walkAndCheck = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walkAndCheck(full);
      } else if (f.endsWith('.md') || f.endsWith('.mdc')) {
        const fields = parseFrontmatter(full);
        const description = fields.description || '';
        if (!description.startsWith(PREFIX)) {
          fail(`${path.relative(ROOT, full)} description must start with ${PREFIX}`);
        }
      }
    }
  };

  for (const base of ['skills', 'agents', 'rules']) {
    walkAndCheck(path.join(ROOT, base));
  }
  log('OMCS_PREFIX_E2E_OK');

  // ---- 3. Temp install check ----
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omc-e2e-qa-'));
  try {
    execSync(`node --experimental-strip-types scripts/install-local-plugin.ts --target-root "${tmpRoot}" --force`, { cwd: ROOT, stdio: 'ignore' });
    const pluginPath = path.join(tmpRoot, 'oh-my-cursor');
    if (!fs.existsSync(path.join(pluginPath, '.cursor-plugin', 'plugin.json'))) {
      fail('temp install missing plugin manifest');
    }
    if (!fs.existsSync(path.join(pluginPath, '.cursor', 'mcp.example.json'))) {
      fail('temp install missing MCP example template');
    }
    if (!fs.existsSync(path.join(pluginPath, 'hooks', 'hooks.json'))) {
      fail('temp install missing hooks/hooks.json');
    }
    if (fs.existsSync(path.join(pluginPath, 'mcp'))) {
      fail('default temp install must not include mcp/');
    }
    log('temp local plugin install has OMCS payload and bounded MCP template');
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  }

  // ---- 4. External runtime compatibility docs check ----
  const checks: Record<string, string[]> = {
    'docs/external-runtime-bridge.md': [
      '~/.claude/skills/',
      '~/.claude/agents/',
      '~/.codex/skills/',
      '~/.codex/agents/',
      'This is not an OMC-vs-Codex comparison',
      'host-product-discovered user assets',
    ],
    'docs/external-runtime-compatibility.md': [
      'Claude and Codex user skills',
      '~/.claude/skills/',
      '~/.codex/skills/',
      '.codex/',
    ],
    'docs/references.md': [
      '.claude/skills/',
      '.codex/skills/',
      '.claude/agents/',
      '.codex/agents/',
      'host-product-discovered',
    ],
  };

  const missing: string[] = [];
  for (const [rel, tokens] of Object.entries(checks)) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      missing.push(`${rel} is missing on disk`);
      continue;
    }
    const text = fs.readFileSync(full, 'utf-8');
    for (const token of tokens) {
      if (!text.includes(token)) {
        missing.push(`${rel}: ${token}`);
      }
    }
  }

  if (missing.length > 0) {
    fail('missing external runtime compatibility documentation\n' + missing.join('\n'));
  }
  log('EXTERNAL_RUNTIME_COMPAT_DOCS_OK');

  // ---- 5. Installed plugin prefix check ----
  const installed = path.join(os.homedir(), '.cursor', 'plugins', 'local', 'oh-my-cursor');
  if (fs.existsSync(installed) && fs.statSync(installed).isDirectory()) {
    try {
      const copyManifestPath = path.join(installed, '.cursor-plugin', 'plugin.json');
      const copyManifest = JSON.parse(fs.readFileSync(copyManifestPath, 'utf-8'));
      if (!String(copyManifest.displayName || '').startsWith(PREFIX)) {
        throw new Error('installed local plugin displayName lacks [OMCS] prefix');
      }
      if (!String(copyManifest.description || '').startsWith(PREFIX)) {
        throw new Error('installed local plugin description lacks [OMCS] prefix');
      }
      log('INSTALLED_OMCS_PREFIX_OK');
    } catch (err: any) {
      if (process.env.CHECK_INSTALLED_PLUGIN === '1') {
        fail(err.message);
      }
      warn(`installed local plugin prefix check failed: ${err.message}; rerun install-local-plugin.ts --force for live-session parity`);
    }
  } else {
    warn(`local plugin is not installed at ${installed}; skipped installed-prefix check`);
  }

  // ---- 6. User compat assets check ----
  if (process.env.CHECK_USER_COMPAT_ASSETS === '1') {
    const home = os.homedir();
    const compatChecks: Record<string, [string, RegExp]> = {
      '~/.claude/skills': [path.join(home, '.claude', 'skills'), /SKILL\.md$/],
      '~/.codex/skills': [path.join(home, '.codex', 'skills'), /SKILL\.md$/],
      '~/.claude/agents': [path.join(home, '.claude', 'agents'), /\.md$/],
    };
    const missingAssets: string[] = [];

    const hasMatchingFile = (dir: string, pattern: RegExp): boolean => {
      if (!fs.existsSync(dir)) return false;
      const walk = (d: string): boolean => {
        for (const f of fs.readdirSync(d)) {
          const full = path.join(d, f);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            if (walk(full)) return true;
          } else if (pattern.test(f)) {
            return true;
          }
        }
        return false;
      };
      return walk(dir);
    };

    for (const [label, [fullPath, pattern]] of Object.entries(compatChecks)) {
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        missingAssets.push(`${label} is missing`);
      } else if (!hasMatchingFile(fullPath, pattern)) {
        missingAssets.push(`${label} contains no matching files`);
      }
    }

    if (missingAssets.length > 0) {
      fail('CHECK_USER_COMPAT_ASSETS=1 failed\n' + missingAssets.join('\n'));
    }

    const codexAgents = path.join(home, '.codex', 'agents');
    if (fs.existsSync(codexAgents)) {
      if (!hasMatchingFile(codexAgents, /\.md$/)) {
        fail('~/.codex/agents exists but contains no agent markdown files');
      }
    } else {
      console.log('bounded: ~/.codex/agents is absent; Cursor will discover Codex user agents when that directory is present');
    }
    log('USER_COMPAT_ASSETS_OK');
    log('OMC and Codex-side user compatibility skills are present; OMC agents are materialized');
  } else {
    warn('set CHECK_USER_COMPAT_ASSETS=1 to assert local ~/.claude and ~/.codex compatibility assets');
  }

  log('E2E_QA_SESSION_ASSETS_OK');
  process.exit(0);
}

main();
