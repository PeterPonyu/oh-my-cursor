import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');
const FIXTURE = path.join(ROOT, 'scripts', 'fixtures', 'expected-rename-references.txt');

const CURRENT_SURFACE_ROOTS = [
  'AGENTS.md',
  'README.md',
  'docs',
  'rules',
  '.cursor/rules',
  '.cursor/state',
  'hooks/README.md',
  'mcp/cursor-state-bridge/README.md',
  'skills',
  'agents',
];

const CURRENT_SURFACE_EXTENSIONS = new Set(['.md', '.mdc', '.json', '.yaml', '.yml']);

const LEGACY_IMPLEMENTATION_NAMES = [
  'validate-notepad-format.py',
  'validate-project-memory.py',
  'validate-decisions-format.py',
  'validate-wiki-structure.py',
  'validate-memory-templates.py',
  'validate-agent-bridge-contract.py',
  'validate-public-language.py',
  'validate-cursor-workflow-artifacts.py',
  'validate-workflow-state.py',
  'validate-mcp-server-structure.py',
  'validate-mcp-trace.py',
  'validate-prd-ac-mapping.py',
  'validate-hook-readonly.py',
  'validate-rename-references.py',
  'resolve-cursor-model.py',
  'link-omc-cursor-compat-assets.py',
  'workflow-state.py',
  'state_io.py',
  '_locking.py',
  '_trace.py',
  'memory_io.py',
  'auth.py',
  'server.py',
  'jail.py',
  'claim-guard.py',
  'stop-gate.py',
  'state-watcher.py',
  'compact-reminder.py',
  'tool-guard.py',
  'shell-guard.py',
  'shell-debrief.py',
  'failure-router.py',
  'session-bootstrap.py',
  'session-summary.py',
  'prompt-router.py',
  'subagent-bootstrap.py',
  'subagent-summary.py',
  'read-advisor.py',
  '_active_role.py',
  '_tool_payload.py',
];

const SCRIPT_REFERENCE_RE = /\bscripts\/[A-Za-z0-9_.-]+\.(?:ts|sh|json|md)\b/g;
const BARE_SCRIPT_REFERENCE_RE = /\b(?:validate|verify|smoke|check|install|build|e2e|link|resolve|run|refine|consensus|workflow-state|count_md)[A-Za-z0-9_.-]*\.(?:ts|sh)\b/g;

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(FIXTURE)) {
  fail(`fixture not found: ${path.relative(ROOT, FIXTURE)}`);
}

function normalize(line: string): string {
  const clean = line.startsWith('./') ? line.slice(2) : line;
  return clean.replace(/^([^:]+):\d+:/, '$1::');
}

function collectCurrentSurfaceFiles(root: string): string[] {
  const rootPath = path.join(ROOT, root);
  if (!fs.existsSync(rootPath)) {
    return [];
  }
  const stat = fs.statSync(rootPath);
  if (stat.isFile()) {
    return CURRENT_SURFACE_EXTENSIONS.has(path.extname(rootPath)) ? [rootPath] : [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const full = path.join(rootPath, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (
      entry.isDirectory() &&
      !['.git', '.omx', '.omcs', 'node_modules', 'dist'].includes(entry.name) &&
      !rel.startsWith('docs/plans/')
    ) {
      files.push(...collectCurrentSurfaceFiles(rel));
    } else if (entry.isFile() && CURRENT_SURFACE_EXTENSIONS.has(path.extname(full))) {
      files.push(full);
    }
  }
  return files;
}

function checkCurrentSurfacesForLegacyImplementationNames() {
  const files = Array.from(new Set(CURRENT_SURFACE_ROOTS.flatMap(collectCurrentSurfaceFiles))).sort();
  const violations: string[] = [];
  const missingScriptReferences: string[] = [];
  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath).split(path.sep).join('/');
    if (rel === 'CHANGELOG.md' || rel.startsWith('docs/plans/') || rel.startsWith('docs/archive/')) {
      continue;
    }
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const legacyName of LEGACY_IMPLEMENTATION_NAMES) {
        if (line.includes(legacyName)) {
          violations.push(`${rel}:${index + 1}: stale implementation reference '${legacyName}': ${line.trim()}`);
        }
      }
      for (const match of line.matchAll(SCRIPT_REFERENCE_RE)) {
        const scriptRef = match[0];
        if (!fs.existsSync(path.join(ROOT, scriptRef))) {
          missingScriptReferences.push(`${rel}:${index + 1}: missing script reference '${scriptRef}': ${line.trim()}`);
        }
      }
      for (const match of line.matchAll(BARE_SCRIPT_REFERENCE_RE)) {
        const scriptName = match[0];
        const scriptRef = `scripts/${scriptName}`;
        if (!fs.existsSync(path.join(ROOT, scriptRef))) {
          missingScriptReferences.push(`${rel}:${index + 1}: missing bare script reference '${scriptName}' (expected ${scriptRef}): ${line.trim()}`);
        }
      }
    });
  }
  if (violations.length > 0) {
    console.error('FAIL: CURRENT_SURFACE_STALE_IMPLEMENTATION_REFERENCES');
    violations.forEach(v => console.error(v));
    process.exit(1);
  }
  if (missingScriptReferences.length > 0) {
    console.error('FAIL: CURRENT_SURFACE_MISSING_SCRIPT_REFERENCES');
    missingScriptReferences.forEach(v => console.error(v));
    process.exit(1);
  }
}

function main() {
  checkCurrentSurfacesForLegacyImplementationNames();

  const fixtureContent = fs.readFileSync(FIXTURE, 'utf-8');
  const fixtureLines = fixtureContent
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => normalize(line))
    .sort();

  let grepText = '';
  try {
    const result = execSync(
      'grep -RIn "workflow-state\\.ts" ' +
      '--include=*.ts ' +
      '--include=*.sh ' +
      '--include=*.md ' +
      '--include=*.mdc ' +
      '--include=*.yaml ' +
      '--exclude-dir=.git ' +
      '--exclude-dir=.conda ' +
      '--exclude-dir=.omcs ' +
      '--exclude-dir=.omc ' +
      '--exclude-dir=.cursor-worktree ' +
      '--exclude-dir=.omx ' +
      '--exclude-dir=node_modules ' +
      '--exclude-dir=dist ' +
      '--exclude-dir=benchmark/runs/data ' +
      '--exclude-dir=docs/plans ' +
      '--exclude=CHANGELOG.md ' +
      '.',
      { cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'] }
    );
    grepText = result.toString('utf-8');
  } catch (err: any) {
    if (err.status === 1) {
      grepText = '';
    } else {
      fail(`grep failed with exit code ${err.status}: ${err.message}`);
    }
  }


  let staleChangelogText = '';
  try {
    const result = execSync(
      'grep -nE \"\\.(py|sh)\\b\" CHANGELOG.md | grep -v \"former \\.py or \\.sh\"',
      { cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'] }
    );
    staleChangelogText = result.toString('utf-8');
  } catch (err: any) {
    if (err.status !== 1) {
      fail(`CHANGELOG stale-reference grep failed with exit code ${err.status}: ${err.message}`);
    }
  }

  if (staleChangelogText.trim()) {
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const hasMigrationNote = changelog
      .slice(0, 500)
      .includes('TypeScript migration note') &&
      changelog.includes('former `.py` or `.sh` implementation paths');
    if (!hasMigrationNote) {
      fail(
        'CHANGELOG_STALE_SCRIPT_REFERENCES: update stale .py/.sh names to current .ts entrypoints ' +
        'or keep them only in a clearly marked historical migration note.'
      );
    }
  }

  const actualLines = grepText
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => normalize(line))
    .sort();

  if (JSON.stringify(actualLines) === JSON.stringify(fixtureLines)) {
    console.log('RENAME_REFERENCES_OK');
    process.exit(0);
  }

  console.error('FAIL: RENAME_REFERENCES_DRIFT: fixture out of date, regenerate or coordinate the rename');
  console.error(`Expected ${fixtureLines.length} references, got ${actualLines.length} references.`);
  
  // Also print the differences
  const expectedSet = new Set(fixtureLines);
  const actualSet = new Set(actualLines);

  const missing = fixtureLines.filter(x => !actualSet.has(x));
  const extra = actualLines.filter(x => !expectedSet.has(x));

  if (missing.length > 0) {
    console.error('Missing in actual grep:');
    missing.forEach(m => console.error(`  - ${m}`));
  }
  if (extra.length > 0) {
    console.error('Extra in actual grep:');
    extra.forEach(e => console.error(`  + ${e}`));
  }

  process.exit(1);
}

main();
