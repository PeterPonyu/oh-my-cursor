import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

function looksLikeRepoRoot(filePath: string): boolean {
  try {
    return (
      fs.existsSync(path.join(filePath, 'AGENTS.md')) &&
      fs.existsSync(path.join(filePath, '.cursor', 'rules')) &&
      fs.statSync(path.join(filePath, '.cursor', 'rules')).isDirectory() &&
      fs.existsSync(path.join(filePath, 'benchmark')) &&
      fs.statSync(path.join(filePath, 'benchmark')).isDirectory()
    );
  } catch {
    return false;
  }
}

function collapseCursorTeamWorktree(filePath: string): string | null {
  const resolved = path.resolve(filePath);
  const parts = resolved.split(path.sep);
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx];
    if (part !== '.cursor-worktree') {
      continue;
    }
    if (idx + 3 >= parts.length) {
      continue;
    }
    if (parts[idx + 1] !== 'team') {
      continue;
    }
    if (!parts.slice(idx + 2).includes('worktrees')) {
      continue;
    }
    const candidate = parts.slice(0, idx).join(path.sep) || path.sep;
    if (looksLikeRepoRoot(candidate)) {
      return candidate;
    }
  }
  return null;
}

function gitToplevel(filePath: string): string | null {
  try {
    const stdout = execSync('git rev-parse --show-toplevel', { cwd: filePath, stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' });
    const val = stdout.trim();
    return val ? path.resolve(val) : null;
  } catch {
    return null;
  }
}

function expandUser(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

export function resolveCanonicalRoot(raw: string): string {
  const start = path.resolve(expandUser(raw));
  const collapsed = collapseCursorTeamWorktree(start);
  if (collapsed !== null) {
    return collapsed;
  }

  let current = start;
  try {
    const stat = fs.statSync(start);
    if (!stat.isDirectory()) {
      current = path.dirname(start);
    }
  } catch {
    current = path.dirname(start);
  }

  let temp = current;
  while (true) {
    if (looksLikeRepoRoot(temp)) {
      return temp;
    }
    const parent = path.dirname(temp);
    if (parent === temp) {
      break;
    }
    temp = parent;
  }

  const gitRoot = gitToplevel(current);
  return gitRoot !== null ? gitRoot : current;
}

function main() {
  const target = process.argv[2] || '.';
  console.log(resolveCanonicalRoot(target));
}

main();
