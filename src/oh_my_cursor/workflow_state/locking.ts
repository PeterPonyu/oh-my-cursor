import * as fs from 'node:fs';
import * as path from 'node:path';

export function acquireFileLock(targetPath: string): () => void {
  const lockDir = targetPath + '.lock';
  const maxRetries = 2000;
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
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelayMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed to acquire lock on ${targetPath} after ${maxRetries} attempts`);
}

export function fileLock<T>(targetPath: string, callback: () => T): T {
  const unlock = acquireFileLock(targetPath);
  try {
    return callback();
  } finally {
    unlock();
  }
}
