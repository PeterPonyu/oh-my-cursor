import * as crypto from 'node:crypto';
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

function readText(relPath: string): string {
  try {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
  } catch (err: any) {
    fail(`read failed for ${relPath}: ${err.message}`);
  }
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

function expectedMarker(source: string, sourceHash: string): string {
  return `<!-- source-sha256: ${source} ${sourceHash} -->`;
}

for (const pair of PAIRS) {
  const sourcePath = path.join(ROOT, pair.source);
  const translationPath = path.join(ROOT, pair.translation);
  if (!fs.existsSync(sourcePath)) fail(`source doc missing: ${pair.source}`);
  if (!fs.existsSync(translationPath)) fail(`translation doc missing: ${pair.translation}`);

  const sourceHash = sha256(readText(pair.source));
  const translationText = readText(pair.translation);
  const marker = expectedMarker(pair.source, sourceHash);
  if (!translationText.includes(marker)) {
    fail(
      `TRANSLATION_STALE: ${pair.translation} is missing ${marker}; ` +
      'update the translation and refresh its source-sha256 marker.'
    );
  }
}

console.log('TRANSLATION_FRESHNESS_OK');
