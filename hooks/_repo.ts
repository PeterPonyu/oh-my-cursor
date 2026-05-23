import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';

function isRepoRoot(dir: string): boolean {
  try {
    const hooksJson = path.join(dir, 'hooks', 'hooks.json');
    const agentsDir = path.join(dir, 'agents');
    const skillsDir = path.join(dir, 'skills');
    const pluginJson = path.join(dir, '.cursor-plugin', 'plugin.json');

    return (
      fs.existsSync(hooksJson) &&
      fs.statSync(hooksJson).isFile() &&
      fs.existsSync(agentsDir) &&
      fs.statSync(agentsDir).isDirectory() &&
      fs.existsSync(skillsDir) &&
      fs.statSync(skillsDir).isDirectory() &&
      fs.existsSync(pluginJson) &&
      fs.statSync(pluginJson).isFile()
    );
  } catch {
    return false;
  }
}

export function resolveRepoRoot(anchor: string): string {
  const envWorkspace = process.env.OH_MY_CURSOR_WORKSPACE || '';
  const pwd = process.cwd();

  for (const raw of [envWorkspace, pwd]) {
    if (!raw) continue;
    const candidate = path.resolve(raw);
    if (isRepoRoot(candidate)) {
      return candidate;
    }
  }

  let current = path.resolve(anchor);
  try {
    if (fs.statSync(current).isFile()) {
      current = path.dirname(current);
    }
  } catch {
    // ignore
  }

  let candidate = current;
  while (true) {
    if (isRepoRoot(candidate)) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      break;
    }
    candidate = parent;
  }

  return path.resolve(current, '..', '..');
}

export function resolveWorkspaceRoot(anchor: string): string {
  const envWorkspace = process.env.OH_MY_CURSOR_WORKSPACE || '';
  const pwd = process.cwd();

  for (const raw of [envWorkspace, pwd]) {
    if (!raw) continue;
    const candidate = path.resolve(raw);
    if (!candidate.includes('plugins/local/oh-my-cursor')) {
      return candidate;
    }
  }
  return resolveRepoRoot(anchor);
}
