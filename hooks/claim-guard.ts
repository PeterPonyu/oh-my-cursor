import * as crypto from 'node:crypto';
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

const SAFETY_SUFFIXES = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.mdc', '.markdown',
  '.yaml', '.yml', '.css', '.html', '.sh', '.py', '.txt', '.jsonld', '.jsonc',
  '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.java', '.kt', '.rb', '.php'
]);

const MAX_SAFETY_SCAN_BYTES = 256 * 1024;
const MAX_SAFETY_SCAN_LINES = 5000;

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

function isNontrivialLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length < 6) return false;
  
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return false;
  }
  
  const singleChars = /^[{}()\[\];,]+$/;
  if (singleChars.test(trimmed)) return false;
  
  if (trimmed.startsWith('import ') || trimmed.startsWith('export ') || (trimmed.startsWith('const ') && trimmed.includes('require('))) {
    return false;
  }
  
  return true;
}

function scanFileSafety(relPath: string): any[] {
  const issues: any[] = [];
  try {
    const fullPath = path.resolve(WORKSPACE_ROOT, relPath);
    if (!fs.existsSync(fullPath)) {
      return [];
    }
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      return [];
    }
    if (stat.size > MAX_SAFETY_SCAN_BYTES) {
      return [];
    }
    
    const ext = path.extname(relPath).toLowerCase();
    if (!SAFETY_SUFFIXES.has(ext)) {
      return [];
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    if (lines.length > MAX_SAFETY_SCAN_LINES) {
      return [];
    }
    
    // 1. Git conflict markers
    for (let lineNo = 1; lineNo <= lines.length; lineNo++) {
      const line = lines[lineNo - 1];
      if (line.startsWith('<<<<<<<') || line.startsWith('>>>>>>>')) {
        issues.push({
          file: relPath.replace(/\\/g, '/'),
          line: lineNo,
          severity: 'severe',
          rule: 'safety-conflict-marker',
          message: `Git conflict marker detected: ${line.trim()}`,
        });
      }
    }

    // 2. Duplicate adjacent lines
    for (let lineNo = 2; lineNo <= lines.length; lineNo++) {
      const current = lines[lineNo - 1].trim();
      const previous = lines[lineNo - 2].trim();
      if (current === previous && isNontrivialLine(current)) {
        issues.push({
          file: relPath.replace(/\\/g, '/'),
          line: lineNo,
          severity: 'warning',
          rule: 'safety-duplicate-line',
          message: `Adjacent duplicate line detected: "${current}"`,
        });
      }
    }

    // 3. Duplicate contiguous blocks (hashing sliding windows of N lines)
    const nonTrivial: { lineNo: number; text: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i].trim();
      if (isNontrivialLine(lineText)) {
        nonTrivial.push({ lineNo: i + 1, text: lineText });
      }
    }

    const M = 4;
    if (nonTrivial.length >= M * 2) {
      const seenBlocks = new Map<string, number[]>();
      
      for (let i = 0; i <= nonTrivial.length - M; i++) {
        const block = nonTrivial.slice(i, i + M);
        const jointText = block.map(item => item.text).join('\n');
        const hash = crypto.createHash('sha256').update(jointText).digest('hex');
        
        const indices = seenBlocks.get(hash);
        if (indices) {
          indices.push(i);
        } else {
          seenBlocks.set(hash, [i]);
        }
      }

      const reportedStartLines = new Set<number>();
      for (const [hash, indices] of seenBlocks.entries()) {
        if (indices.length > 1) {
          for (let k = 1; k < indices.length; k++) {
            const prevIndex = indices[0];
            const currIndex = indices[k];
            
            if (currIndex - prevIndex >= M) {
              const startLine1 = nonTrivial[prevIndex].lineNo;
              const endLine1 = nonTrivial[prevIndex + M - 1].lineNo;
              const startLine2 = nonTrivial[currIndex].lineNo;
              const endLine2 = nonTrivial[currIndex + M - 1].lineNo;
              
              if (!reportedStartLines.has(startLine2)) {
                reportedStartLines.add(startLine2);
                issues.push({
                  file: relPath.replace(/\\/g, '/'),
                  line: startLine2,
                  severity: 'warning',
                  rule: 'safety-duplicate-block',
                  message: `Duplicate code block detected: lines ${startLine2}-${endLine2} match lines ${startLine1}-${endLine1}. Verify edit alignment.`,
                });
              }
            }
          }
        }
      }
    }
  } catch {
    // fail-safe
  }
  return issues;
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
    issues.push(...scanFileSafety(relPath));
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
    output.message = 'Severe unsupported runtime claim or safety issue detected; review before continuing.';
  } else if (warningCount > 0) {
    output.message = 'Public wording warning or code safety issue detected; review edits.';
  } else {
    output.message = 'Claim/proof and safety audit passed.';
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
