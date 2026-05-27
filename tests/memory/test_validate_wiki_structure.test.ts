// Node --test coverage for scripts/validate-wiki-structure.ts
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const SCRIPT = path.resolve(path.dirname(currentFile), '..', '..', 'scripts', 'validate-wiki-structure.ts');

const CLEAN_INDEX = '# Wiki index\n\n## Pages\n- [[overview]]\n';
const CLEAN_LOG =
  '# Wiki log\n\n' +
  '2026-05-20T15:00:00Z  add     overview  initial\n' +
  '2026-05-20T16:00:00Z  update  overview  follow-up\n';
const CLEAN_PAGE =
  '---\n' +
  'slug: overview\n' +
  'title: Overview\n' +
  'created: 2026-05-20\n' +
  'updated: 2026-05-20\n' +
  'tags: []\n' +
  '---\n\n' +
  '# Overview\n\n## Summary\n\nOne paragraph.\n';

function seedWiki(root: string): string {
  const wiki = path.join(root, 'wiki');
  fs.mkdirSync(wiki);
  fs.writeFileSync(path.join(wiki, 'index.md'), CLEAN_INDEX, 'utf-8');
  fs.writeFileSync(path.join(wiki, 'log.md'), CLEAN_LOG, 'utf-8');
  fs.writeFileSync(path.join(wiki, 'overview.md'), CLEAN_PAGE, 'utf-8');
  return wiki;
}

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-wiki-test-'));
}

function cleanupTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runScript(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', SCRIPT, ...args],
    { encoding: 'utf-8' },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('self test passes', () => {
  const result = runScript(['--self-test']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('VALIDATE_WIKI_STRUCTURE_SELF_TEST_OK'));
});

test('clean wiki passes', () => {
  const tmp = makeTmp();
  try {
    const wiki = seedWiki(tmp);
    const result = runScript([wiki]);
    assert.equal(result.status, 0);
  } finally {
    cleanupTmp(tmp);
  }
});

test('missing index fails', () => {
  const tmp = makeTmp();
  try {
    const wiki = seedWiki(tmp);
    fs.unlinkSync(path.join(wiki, 'index.md'));
    const result = runScript([wiki]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('wiki index missing'));
  } finally {
    cleanupTmp(tmp);
  }
});

test('out of order log fails', () => {
  const tmp = makeTmp();
  try {
    const wiki = seedWiki(tmp);
    fs.writeFileSync(
      path.join(wiki, 'log.md'),
      '# Wiki log\n\n' +
        '2026-05-20T16:00:00Z  update  overview  second\n' +
        '2026-05-20T15:00:00Z  add     overview  first\n',
      'utf-8',
    );
    const result = runScript([wiki]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('not sorted non-decreasing'));
  } finally {
    cleanupTmp(tmp);
  }
});

test('page missing frontmatter fails', () => {
  const tmp = makeTmp();
  try {
    const wiki = seedWiki(tmp);
    fs.writeFileSync(path.join(wiki, 'no-frontmatter.md'), '# Just a body\n', 'utf-8');
    const result = runScript([wiki]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('missing frontmatter'));
  } finally {
    cleanupTmp(tmp);
  }
});

test('oversized page fails', () => {
  const tmp = makeTmp();
  try {
    const wiki = seedWiki(tmp);
    const big = CLEAN_PAGE.replace('One paragraph.', 'x'.repeat(11 * 1024));
    fs.writeFileSync(path.join(wiki, 'huge.md'), big, 'utf-8');
    const result = runScript([wiki]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('cap is 10240'));
  } finally {
    cleanupTmp(tmp);
  }
});
