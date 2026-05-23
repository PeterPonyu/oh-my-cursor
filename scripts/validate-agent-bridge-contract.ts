import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const WRITER_PATH_PATTERNS = [
  /\.cursor\/state\/workflow-state\.(?:ts|py)/,
  /scripts\/workflow-state\.(?:ts|py)/,
  /src\/oh_my_cursor\/workflow_state\/(?:api|cli)\.(?:ts|py)/,
];
const READONLY_VALIDATOR_RE = /validate-workflow-state\.(?:ts|py)/;

const STALE_ARCHIVED_PATHS = [
  /\bdocs\/refinement-priority-map\.md\b/,
  /\bdocs\/plugin-boundary-review\.md\b/,
  /\bdocs\/fallback-policy\.md\b/,
];

const LEGACY_SHORT_NAMES = [
  { regex: /(?<![A-Za-z0-9])omx(?![A-Za-z0-9])/i, label: 'legacy-short-name-b' },
  { regex: /oh-my-codex/i, label: 'legacy-package-b' },
];

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`ok: ${message}`);
}

function getAgentCallableFiles(root: string): string[] {
  const files: string[] = [];
  const addFilesFromDir = (dirPath: string, extPattern: RegExp) => {
    if (!fs.existsSync(dirPath)) return;
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const full = path.join(dirPath, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        addFilesFromDir(full, extPattern);
      } else if (extPattern.test(item)) {
        files.push(full);
      }
    }
  };

  addFilesFromDir(path.join(root, 'agents'), /\.md$/);
  addFilesFromDir(path.join(root, 'skills'), /^SKILL\.md$/);
  addFilesFromDir(path.join(root, 'rules'), /\.(md|mdc)$/);
  addFilesFromDir(path.join(root, '.cursor', 'rules'), /\.(md|mdc)$/);

  return files.sort();
}

function renderPath(filePath: string): string {
  try {
    return path.relative(ROOT, filePath);
  } catch {
    return filePath;
  }
}

function scanFile(filePath: string): string[] {
  const offenders: string[] = [];
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    return [`${filePath}: read error: ${err.message}`];
  }

  const cite = renderPath(filePath);
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    // 1. Writer CLI bypass
    for (const pattern of WRITER_PATH_PATTERNS) {
      if (pattern.test(raw)) {
        if (READONLY_VALIDATOR_RE.test(raw)) {
          continue;
        }
        offenders.push(
          `${cite}:${lineNo} references the workflow-state writer CLI directly: ${raw.trim().slice(0, 120)}`
        );
        break;
      }
    }

    // 2. Archived doc paths
    for (const pattern of STALE_ARCHIVED_PATHS) {
      if (pattern.test(raw)) {
        offenders.push(
          `${cite}:${lineNo} references archived doc with old path; use docs/archive/: ${raw.trim().slice(0, 120)}`
        );
        break;
      }
    }

    // 3. Legacy short names
    for (const { regex, label } of LEGACY_SHORT_NAMES) {
      if (regex.test(raw)) {
        offenders.push(`${cite}:${lineNo} legacy ${label}: ${raw.trim().slice(0, 120)}`);
        break;
      }
    }
  });

  return offenders;
}

function runDefaultScan(root: string = ROOT): number {
  const files = getAgentCallableFiles(root);
  if (files.length === 0) {
    fail(`no agent-callable files found under ${root}`);
  }

  const offenders: string[] = [];
  for (const f of files) {
    offenders.push(...scanFile(f));
  }

  if (offenders.length > 0) {
    console.error('FAIL: agent-callable surface contract violated:');
    for (const line of offenders) {
      console.error(`  ${line}`);
    }
    process.exit(1);
  }

  ok(`scanned ${files.length} agent-callable surfaces; contract clean`);
  console.log('AGENT_BRIDGE_CONTRACT_OK');
  return 0;
}

const OFFENDER_BYPASS = `
---
name: bad-agent
---
Run \`node --experimental-strip-types .cursor/state/workflow-state.ts init ...\` to start.
`.trim() + '\n';

const OFFENDER_STALE_PATH = `
---
name: stale-link-agent
---
See [\`docs/refinement-priority-map.md\`](../../docs/refinement-priority-map.md).
`.trim() + '\n';

const OFFENDER_LEGACY_NAME = `
---
name: legacy-name-agent
---
The omx team will follow this convention.
`.trim() + '\n';

const CLEAN_FIXTURE = `
---
name: clean-agent
---
Use the cursor-state-bridge MCP tools (\`state_init\`, \`state_set_phase\`)
to write workflow state; never shell out to a writer CLI. Validate
on-disk state with \`node --experimental-strip-types scripts/validate-workflow-state.ts <path>\`.
`.trim() + '\n';

function runSelfTest(): number {
  const tempDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'omcs-agent-bridge-self-'));
  try {
    const agentsDir = path.join(tempDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const tests = [
      { name: 'bypass.md', content: OFFENDER_BYPASS, label: 'writer CLI' },
      { name: 'stale.md', content: OFFENDER_STALE_PATH, label: 'archived doc' },
      { name: 'legacy.md', content: OFFENDER_LEGACY_NAME, label: 'legacy' },
    ];

    for (const t of tests) {
      const offenderPath = path.join(agentsDir, t.name);
      fs.writeFileSync(offenderPath, t.content, 'utf-8');
      const results = scanFile(offenderPath);
      if (results.length === 0) {
        fail(`self-test offender ${t.name} not detected (expected '${t.label}')`);
      }
      ok(`self-test detected ${t.name}: ${results[0]}`);
    }

    const cleanPath = path.join(agentsDir, 'clean.md');
    fs.writeFileSync(cleanPath, CLEAN_FIXTURE, 'utf-8');
    const results = scanFile(cleanPath);
    if (results.length > 0) {
      fail(`self-test clean fixture should pass but got: ${results}`);
    }
    ok('self-test clean fixture passes');
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
  console.log('AGENT_BRIDGE_CONTRACT_SELF_TEST_OK');
  return 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exit(runSelfTest());
  }
  process.exit(runDefaultScan());
}

main();
