import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveWorkspaceRoot } from './_repo.ts';
import { trace } from './_trace.ts';

const currentFile = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = resolveWorkspaceRoot(currentFile);

const PUBLIC_ROOT_FILES = new Set(['AGENTS.md', 'README.md', 'CHANGELOG.md']);

const PUBLIC_PREFIXES = [
  'docs/',
  'rules/',
  'skills/',
  '.cursor/rules/',
  'apps/cursor-backbone-site/app/',
  'benchmark/',
];

const EXCLUDED_PREFIXES = [
  'benchmark/results/',
  'benchmark/runs/data/',
  'benchmark/runs/stale-runs-',
  'apps/cursor-backbone-site/.next/',
  'apps/cursor-backbone-site/out/',
];

const PUBLIC_SUFFIXES = new Set(['.md', '.mdc', '.markdown', '.yaml', '.yml', '.tsx', '.ts', '.jsx', '.js']);

const LANGUAGE_PATTERNS: Record<string, RegExp> = {
  'legacy-short-name-b': /(?<![A-Za-z0-9])omx(?![A-Za-z0-9])/i,
  'legacy-package-b': /oh-my-codex/i,
  'source-system': /source[ -]system/i,
  'comparison-clone': /parity clone/i,
  'legacy-arm': /(?<!-)with-omc\b/i,
  'external-source': /external[ -]source/i,
};

const SEVERE_OVERCLAIMS: Record<string, RegExp> = {
  'default-mcp': /repo[- ]owned.{0,80}(?:\.cursor\/mcp\.json|mcp config)/i,
  'marketplace-publication': /marketplace publication.{0,80}(?:required|shipped|complete|repo[- ]owned)/i,
  'repo-file-modes': /repo[- ]file.{0,60}custom modes?/i,
  'repo-file-background-agents': /repo[- ]file.{0,60}background[- ]agents?/i,
};

const SEVERE_NEGATIONS = [
  'does not claim',
  'do not claim',
  'not claim',
  'remain outside',
  'outside the current',
  'until',
  'unless',
];

function readPayload(): any {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw.trim()) {
      return {};
    }
    return JSON.parse(raw);
  } catch (err: any) {
    return { _invalid_json: true };
  }
}

function pathFromUri(value: string): string | null {
  if (!value.startsWith('file:')) {
    return value;
  }
  try {
    return fileURLToPath(value);
  } catch {
    return null;
  }
}

function collectPaths(value: any): string[] {
  const paths: string[] = [];
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      for (const item of value) {
        paths.push(...collectPaths(item));
      }
    } else {
      for (const [key, nested] of Object.entries(value)) {
        const lowered = key.toLowerCase();
        if (['path', 'filepath', 'file', 'uri'].includes(lowered) && typeof nested === 'string') {
          const parsed = pathFromUri(nested);
          if (parsed) {
            paths.push(parsed);
          }
        } else if (['paths', 'files', 'edited_files', 'editedfiles', 'changed_files', 'changedfiles'].includes(lowered)) {
          paths.push(...collectPaths(nested));
        } else {
          paths.push(...collectPaths(nested));
        }
      }
    }
  } else if (typeof value === 'string') {
    const parsed = pathFromUri(value);
    if (parsed && (parsed.includes('/') || parsed.includes('.'))) {
      paths.push(parsed);
    }
  }
  return paths;
}

function relativePath(rawPath: string): string | null {
  try {
    let candidate = rawPath;
    if (candidate.startsWith('~')) {
      const homedir = process.env.HOME || '';
      candidate = path.join(homedir, candidate.slice(1));
    }
    const fullPath = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(WORKSPACE_ROOT, candidate);
    return path.relative(WORKSPACE_ROOT, fullPath);
  } catch {
    return null;
  }
}

function isPublicText(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (EXCLUDED_PREFIXES.some(prefix => normalized.startsWith(prefix))) {
    return false;
  }
  const basename = path.basename(normalized);
  if (basename.startsWith('.') && !normalized.startsWith('.cursor/rules/')) {
    return false;
  }
  const ext = path.extname(normalized);
  if (!PUBLIC_SUFFIXES.has(ext)) {
    return false;
  }
  if (PUBLIC_ROOT_FILES.has(normalized)) {
    return true;
  }
  if (normalized.startsWith('benchmark/')) {
    return ext === '.md' && !normalized.startsWith('benchmark/results/');
  }
  return PUBLIC_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function scanFile(relPath: string): any[] {
  try {
    const fullPath = path.resolve(WORKSPACE_ROOT, relPath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile() || !isPublicText(relPath)) {
      return [];
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const issues: any[] = [];

    for (let lineNo = 1; lineNo <= lines.length; lineNo++) {
      const line = lines[lineNo - 1];
      for (const [label, regex] of Object.entries(LANGUAGE_PATTERNS)) {
        if (regex.test(line)) {
          issues.push({
            file: relPath.replace(/\\/g, '/'),
            line: lineNo,
            severity: 'warning',
            rule: label,
          });
        }
      }
      const loweredLine = line.toLowerCase();
      for (const [label, regex] of Object.entries(SEVERE_OVERCLAIMS)) {
        if (SEVERE_NEGATIONS.some(negation => loweredLine.includes(negation))) {
          continue;
        }
        if (regex.test(line)) {
          issues.push({
            file: relPath.replace(/\\/g, '/'),
            line: lineNo,
            severity: 'severe',
            rule: label,
          });
        }
      }
    }
    return issues;
  } catch {
    return [];
  }
}

function main(): number {
  const payload = readPayload();
  if (payload?._invalid_json) {
    console.log(JSON.stringify({
      status: 'pass',
      fail_open: true,
      message: 'Hook input was not JSON; skipped audit.'
    }));
    return 0;
  }

  const relPaths: string[] = [];
  const seen = new Set<string>();
  for (const rawPath of collectPaths(payload)) {
    const rel = relativePath(rawPath);
    if (rel === null) continue;
    const key = rel.replace(/\\/g, '/');
    if (!seen.has(key)) {
      seen.add(key);
      relPaths.push(rel);
    }
  }

  const issues: any[] = [];
  for (const relPath of relPaths) {
    issues.push(...scanFile(relPath));
  }

  const severeCount = issues.filter(issue => issue.severity === 'severe').length;
  const warningCount = issues.filter(issue => issue.severity === 'warning').length;
  const status = severeCount > 0 ? 'severe' : warningCount > 0 ? 'warning' : 'pass';

  const output: Record<string, any> = {
    status,
    fail_open: severeCount === 0,
    checked_files: relPaths.map(p => p.replace(/\\/g, '/')),
    warning_count: warningCount,
    severe_count: severeCount,
    issues: issues.slice(0, 50),
  };

  if (severeCount > 0) {
    output.message = 'Severe unsupported runtime claim detected; review before continuing.';
  } else if (warningCount > 0) {
    output.message = 'Public wording warning detected; keep product posture artifact-backed.';
  } else {
    output.message = 'Claim/proof audit passed.';
  }

  trace({
    hook: 'claim-guard',
    event: 'afterFileEdit',
    status,
    checked_files: output.checked_files,
    warning_count: warningCount,
    severe_count: severeCount,
  });

  console.log(JSON.stringify(output));
  return severeCount > 0 ? 2 : 0;
}

process.exit(main());
