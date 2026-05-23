import * as fs from 'node:fs';
import * as path from 'node:path';

export class JailError extends Error {}

export function jailRoots(workspace: string): string[] {
  const ws = path.resolve(workspace);
  return [
    path.join(ws, '.cursor', 'state'),
    path.join(ws, 'docs', 'plans'),
    path.join(ws, '.omcs', 'cursor-state-bridge'),
  ];
}

export function resolveJailed(workspace: string, target: string): string {
  const ws = path.resolve(workspace);
  let resolved: string;
  try {
    resolved = fs.realpathSync(target);
  } catch {
    resolved = path.resolve(target);
  }

  const roots = jailRoots(ws);
  for (const root of roots) {
    let realRoot: string;
    try {
      realRoot = fs.realpathSync(root);
    } catch {
      realRoot = path.resolve(root);
    }

    const relative = path.relative(realRoot, resolved);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return resolved;
    }
  }
  throw new JailError(`jail-escape: ${target} not under any allowed root`);
}
