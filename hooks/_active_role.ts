import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveRepoRoot, resolveWorkspaceRoot } from './_repo.ts';

const currentFile = fileURLToPath(import.meta.url);
const PAYLOAD_ROOT = resolveRepoRoot(currentFile);
const WORKSPACE_ROOT = resolveWorkspaceRoot(currentFile);

const STATE_DIR = path.join(WORKSPACE_ROOT, '.cursor', 'state');
export const ACTIVE_ROLE_PATH = path.join(STATE_DIR, 'active-role.json');
export const AGENTS_DIR = path.join(PAYLOAD_ROOT, 'agents');

export function acquireFileLock(targetPath: string): () => void {
  const lockDir = targetPath + '.lock';
  const maxRetries = 100;
  const retryDelayMs = 50;

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  } catch {
    // ignore
  }

  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.mkdirSync(lockDir);
      return () => {
        try {
          fs.rmdirSync(lockDir);
        } catch {
          // ignore
        }
      };
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        try {
          const stat = fs.statSync(lockDir);
          const ageMs = Date.now() - stat.mtimeMs;
          if (ageMs > 10000) {
            fs.rmdirSync(lockDir);
          }
        } catch {
          // ignore
        }
        const start = Date.now();
        while (Date.now() - start < retryDelayMs) {}
        continue;
      }
      throw err;
    }
  }
  return () => {};
}

export function setActiveRole(role: string, subagentId: string = ''): void {
  if (!role) return;
  const payload = {
    role,
    started_at: new Date().toISOString(),
    subagent_id: subagentId || '',
  };
  
  try {
    fs.mkdirSync(path.dirname(ACTIVE_ROLE_PATH), { recursive: true });
  } catch {
    // ignore
  }
  
  const unlock = acquireFileLock(ACTIVE_ROLE_PATH);
  try {
    const tmp = ACTIVE_ROLE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payload) + '\n', 'utf-8');
    fs.renameSync(tmp, ACTIVE_ROLE_PATH);
  } finally {
    unlock();
  }
}

export function clearActiveRole(): void {
  const unlock = acquireFileLock(ACTIVE_ROLE_PATH);
  try {
    if (fs.existsSync(ACTIVE_ROLE_PATH)) {
      fs.unlinkSync(ACTIVE_ROLE_PATH);
    }
  } catch {
    // ignore
  } finally {
    unlock();
  }
}

export function getActiveRole(): string | null {
  try {
    if (!fs.existsSync(ACTIVE_ROLE_PATH)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(ACTIVE_ROLE_PATH, 'utf-8'));
    if (data && typeof data === 'object' && typeof data.role === 'string' && data.role) {
      return data.role;
    }
  } catch {
    // ignore
  }
  return null;
}

const LIST_RE = /^\s*\[(.*)\]\s*$/;

function parseValue(raw: string): any {
  raw = raw.trim();
  if (raw === '') {
    return '';
  }
  if (raw.toLowerCase() === 'true') return true;
  if (raw.toLowerCase() === 'false') return false;

  const listMatch = raw.match(LIST_RE);
  if (listMatch) {
    const body = listMatch[1].trim();
    if (!body) return [];
    const items: string[] = [];
    for (const chunk of body.split(',')) {
      const item = chunk.trim().replace(/^["']|["']$/g, '');
      if (item) {
        items.push(item);
      }
    }
    return items;
  }

  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

export function parseAgentFrontmatter(role: string): Record<string, any> {
  if (!role) return {};
  if (role.includes('/') || role.includes('\\') || role.includes('..')) {
    return {};
  }
  const agentFile = path.join(AGENTS_DIR, `${role}.md`);
  try {
    if (!fs.existsSync(agentFile)) {
      return {};
    }
    const text = fs.readFileSync(agentFile, 'utf-8');
    if (!text.startsWith('---')) {
      return {};
    }
    const parts = text.split('---', 3);
    if (parts.length < 3) {
      return {};
    }
    const block = parts[1];
    const result: Record<string, any> = {};
    for (const line of block.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      if (!trimmed.includes(':')) {
        continue;
      }
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIndex).trim();
      const rawValue = trimmed.slice(colonIndex + 1);
      if (!key) continue;
      result[key] = parseValue(rawValue);
    }
    return result;
  } catch {
    return {};
  }
}

export function agentToolsAllowlist(role: string): string[] | null {
  const fm = parseAgentFrontmatter(role);
  const tools = fm.tools;
  if (Array.isArray(tools)) {
    return tools.filter((t: any) => typeof t === 'string' && t);
  }
  return null;
}

export function agentIsReadonly(role: string): boolean | null {
  const fm = parseAgentFrontmatter(role);
  const flag = fm.readonly;
  if (typeof flag === 'boolean') {
    return flag;
  }
  return null;
}
