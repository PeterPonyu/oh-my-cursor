import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const PUBLIC_ROOT_FILES = ['AGENTS.md', 'README.md', 'CHANGELOG.md'];
const PUBLIC_DIRS = ['docs', 'rules', 'skills', '.cursor/rules'];
const PUBLIC_SUFFIXES = new Set(['.md', '.mdc', '.markdown', '.yaml', '.yml']);
const APP_SUFFIXES = new Set(['.ts', '.tsx', '.js', '.jsx', '.md']);

const EXCLUDED_PREFIXES = [
  'benchmark/runs/data/',
  'apps/cursor-backbone-site/.next/',
  'apps/cursor-backbone-site/out/',
  'node_modules/',
  'docs/plans/',
];

const FORBIDDEN_PATTERNS: Record<string, RegExp> = {
  'legacy-short-name-b': /(?<![A-Za-z0-9])omx(?![A-Za-z0-9])/i,
  'legacy-package-b': /oh-my-codex/i,
  'source-system': /source[ -]system/i,
  'comparison-clone': /parity clone/i,
  'legacy-arm': /(?<!-)with-omc\b/i,
  'external-source': /external[ -]source/i,
};

function isExcluded(filePath: string): boolean {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  return EXCLUDED_PREFIXES.some(prefix => rel.startsWith(prefix));
}

function isSkipWorktree(filePath: string): boolean {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  if (rel.startsWith('..')) return false;

  try {
    const output = execFileSync('git', ['ls-files', '-v', '--', rel], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output.startsWith('S ');
  } catch {
    return false;
  }
}

function iterPublicFiles(): string[] {
  const files = new Set<string>();

  for (const name of PUBLIC_ROOT_FILES) {
    const p = path.join(ROOT, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      files.add(p);
    }
  }

  function walk(dir: string, suffixes: Set<string>) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, suffixes);
      } else if (stat.isFile() && suffixes.has(path.extname(f)) && !isExcluded(full)) {
        files.add(full);
      }
    }
  }

  for (const dirname of PUBLIC_DIRS) {
    walk(path.join(ROOT, dirname), PUBLIC_SUFFIXES);
  }

  const appBase = path.join(ROOT, 'apps', 'cursor-backbone-site', 'app');
  walk(appBase, APP_SUFFIXES);

  const benchmarkBase = path.join(ROOT, 'benchmark');
  walk(benchmarkBase, new Set(['.md']));

  return Array.from(files).filter(filePath => !isSkipWorktree(filePath)).sort();
}

function main() {
  const violations: string[] = [];
  const files = iterPublicFiles();

  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath);
    let text = '';
    try {
      text = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let lineNo = 1; lineNo <= lines.length; lineNo++) {
      const line = lines[lineNo - 1];
      for (const [label, pattern] of Object.entries(FORBIDDEN_PATTERNS)) {
        if (pattern.test(line)) {
          violations.push(`${rel}:${lineNo}: ${label}`);
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('PUBLIC_LANGUAGE_FAIL');
    for (const violation of violations) {
      console.error(violation);
    }
    process.exit(1);
  }

  console.log('PUBLIC_LANGUAGE_OK');
  process.exit(0);
}

main();
