import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const PAIRS = [
  { source: 'README.md', translation: 'docs/zh/README.zh.md' },
  { source: 'AGENTS.md', translation: 'docs/zh/AGENTS.zh.md' },
];

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function fileMtimeMs(relPath: string): number {
  try {
    return fs.statSync(path.join(ROOT, relPath)).mtimeMs;
  } catch (err: any) {
    fail(`stat failed for ${relPath}: ${err.message}`);
  }
}

for (const pair of PAIRS) {
  const sourcePath = path.join(ROOT, pair.source);
  const translationPath = path.join(ROOT, pair.translation);
  if (!fs.existsSync(sourcePath)) fail(`source doc missing: ${pair.source}`);
  if (!fs.existsSync(translationPath)) fail(`translation doc missing: ${pair.translation}`);

  const sourceMtime = fileMtimeMs(pair.source);
  const translationMtime = fileMtimeMs(pair.translation);
  if (sourceMtime > translationMtime + 1000) {
    fail(
      `TRANSLATION_STALE: ${pair.translation} is older than ${pair.source}; ` +
      'update the translation or commit both docs together.'
    );
  }
}

console.log('TRANSLATION_FRESHNESS_OK');
