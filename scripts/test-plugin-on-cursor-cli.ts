import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

let MIN_CURSOR_CLI_VERSION = process.env.MIN_CURSOR_CLI_VERSION || '2025.01.01';
let RUN_PROMPT = process.env.RUN_CURSOR_AGENT_PLUGIN_TEST_PROMPT === '1';
let TIMEOUT_SECONDS = parseInt(process.env.CURSOR_PLUGIN_TEST_TIMEOUT || '120', 10);
let KEEP_TARGET_ROOT = false;
let TARGET_ROOT = '';

function usage() {
  console.log(`Usage: node --experimental-strip-types scripts/test-plugin-on-cursor-cli.ts [--root PATH] [--target-root PATH]
                                             [--keep-target-root]
                                             [--min-version YYYY.MM.DD]
                                             [--run-prompt]

End-to-end plugin compatibility test against the installed cursor-agent CLI.

Options:
  --root PATH             Repo root (default: script's parent directory).
  --target-root PATH      Use this directory as the local-plugin target root
                           instead of a fresh tempdir. Useful for inspecting
                           install output. Will be created if missing.
  --keep-target-root      Do not remove the tempdir target root on exit.
  --min-version YYYY.MM.DD  Minimum supported cursor-agent calendar version.
  --run-prompt            Also run the opt-in read-only model-backed prompt
                           smoke. Requires cursor-agent default auth and an
                           available auto model. Equivalent to setting
                           RUN_CURSOR_AGENT_PLUGIN_TEST_PROMPT=1.

Environment overrides:
  MIN_CURSOR_CLI_VERSION              Same as --min-version.
  RUN_CURSOR_AGENT_PLUGIN_TEST_PROMPT Set to 1 to enable the prompt smoke.
  CURSOR_PLUGIN_TEST_TIMEOUT          Per-cursor-agent invocation timeout (s).`);
}

function log(msg: string): void {
  console.log(`ok: ${msg}`);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  let repoRoot = ROOT;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--root') {
      if (i + 1 >= args.length) fail('--root requires a path');
      repoRoot = path.resolve(args[++i]);
    } else if (arg === '--target-root') {
      if (i + 1 >= args.length) fail('--target-root requires a path');
      TARGET_ROOT = args[++i];
    } else if (arg === '--keep-target-root') {
      KEEP_TARGET_ROOT = true;
    } else if (arg === '--min-version') {
      if (i + 1 >= args.length) fail('--min-version requires YYYY.MM.DD');
      MIN_CURSOR_CLI_VERSION = args[++i];
    } else if (arg === '--run-prompt') {
      RUN_PROMPT = true;
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      console.error(`FAIL: unknown argument: ${arg}`);
      usage();
      process.exit(1);
    }
  }

  // 1. cursor-agent presence
  try {
    execSync('which cursor-agent', { stdio: 'ignore' });
  } catch {
    fail('cursor-agent not found in PATH; install the Cursor CLI first');
  }

  let rawVersion = '';
  try {
    rawVersion = execSync('cursor-agent --version 2>/dev/null', { encoding: 'utf-8' }).trim();
  } catch {}
  if (!rawVersion) {
    fail('cursor-agent --version returned no output');
  }
  log(`cursor-agent --version reports ${rawVersion}`);

  const installedCalver = rawVersion.split('-')[0];
  if (!/^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$/.test(installedCalver)) {
    fail(`cursor-agent version ${rawVersion} does not start with a YYYY.MM.DD calendar component`);
  }
  if (!/^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$/.test(MIN_CURSOR_CLI_VERSION)) {
    fail(`MIN_CURSOR_CLI_VERSION (${MIN_CURSOR_CLI_VERSION}) must be YYYY.MM.DD`);
  }
  if (installedCalver < MIN_CURSOR_CLI_VERSION) {
    fail(`cursor-agent calver ${installedCalver} is older than required ${MIN_CURSOR_CLI_VERSION}`);
  }
  log(`cursor-agent calver ${installedCalver} is at or above ${MIN_CURSOR_CLI_VERSION}`);

  // 2. cursor-agent --help
  let helpOut = '';
  try {
    helpOut = execSync('cursor-agent --help 2>&1', { encoding: 'utf-8' });
  } catch {}
  for (const flag of ['-p', '--print', '--output-format', '--mode', '--trust', '--workspace']) {
    if (!helpOut.includes(flag)) {
      fail(`cursor-agent --help no longer advertises required flag: ${flag}`);
    }
  }
  log('cursor-agent --help advertises -p, --output-format, --mode, --trust, --workspace');

  // 3. validate-plugin-structure
  try {
    execSync('node --experimental-strip-types scripts/validate-plugin-structure.ts', { cwd: repoRoot, stdio: 'ignore' });
    log('validate-plugin-structure.ts passed (manifest + structure)');
  } catch (err: any) {
    fail(`validate-plugin-structure.ts failed: ${err.message}`);
  }

  // Confirm manifest paths
  const pluginJsonPath = path.join(repoRoot, '.cursor-plugin', 'plugin.json');
  const manifest = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
  const defaults: Record<string, string> = {
    rules: 'rules',
    skills: 'skills',
    agents: 'agents',
    hooks: 'hooks/hooks.json',
    cursorRules: '.cursor/rules',
  };
  const expectations: Record<string, [string, string]> = {
    rules: ['dir', manifest.rules || defaults.rules],
    skills: ['dir', manifest.skills || defaults.skills],
    agents: ['dir', manifest.agents || defaults.agents],
    hooks: ['file', manifest.hooks || defaults.hooks],
    cursorRules: ['dir', defaults.cursorRules],
  };
  if (manifest.mcpServers) {
    expectations.mcpServers = ['file', manifest.mcpServers];
  }

  const manifestErrors: string[] = [];
  for (const [key, [kind, rel]] of Object.entries(expectations)) {
    if (typeof rel !== 'string' || !rel) {
      manifestErrors.push(`manifest missing ${key} as a non-empty string`);
      continue;
    }
    const fullPath = path.join(repoRoot, rel);
    if (!fs.existsSync(fullPath)) {
      manifestErrors.push(`manifest ${key} -> ${rel} does not exist on disk`);
      continue;
    }
    const stat = fs.statSync(fullPath);
    if (kind === 'dir' && !stat.isDirectory()) {
      manifestErrors.push(`manifest ${key} -> ${rel} expected to be a directory`);
    }
    if (kind === 'file' && !stat.isFile()) {
      manifestErrors.push(`manifest ${key} -> ${rel} expected to be a file`);
    }
  }
  if (manifestErrors.length > 0) {
    fail(manifestErrors.join('\n'));
  }

  // Hooks parseable JSON
  const hooksPath = path.join(repoRoot, expectations.hooks[1]);
  const hooksDoc = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
  if (!hooksDoc.hooks || typeof hooksDoc.hooks !== 'object' || Object.keys(hooksDoc.hooks).length === 0) {
    fail("hooks file has no non-empty 'hooks' mapping");
  }
  log(`discovery paths resolve and ${expectations.hooks[1]} parses as a hooks document`);

  // 4. install into temp local-plugin root (symlink and copy modes)
  let tempTargetRoot = '';
  if (!TARGET_ROOT) {
    tempTargetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omc-plugin-cli-test-'));
    TARGET_ROOT = tempTargetRoot;
  } else {
    fs.mkdirSync(TARGET_ROOT, { recursive: true });
    TARGET_ROOT = path.resolve(TARGET_ROOT);
  }

  const symlinkRoot = path.join(TARGET_ROOT, 'symlink');
  const copyRoot = path.join(TARGET_ROOT, 'copy');
  fs.mkdirSync(symlinkRoot, { recursive: true });
  fs.mkdirSync(copyRoot, { recursive: true });

  const cleanup = () => {
    if (!KEEP_TARGET_ROOT && tempTargetRoot && fs.existsSync(tempTargetRoot)) {
      try {
        fs.rmSync(tempTargetRoot, { recursive: true, force: true });
      } catch {}
    }
  };

  try {
    execSync(`node --experimental-strip-types scripts/install-local-plugin.ts --target-root "${symlinkRoot}" --name oh-my-cursor --symlink --force`, { cwd: repoRoot, stdio: 'ignore' });
    const symlinkDest = path.join(symlinkRoot, 'oh-my-cursor');
    if (!fs.lstatSync(symlinkDest).isSymbolicLink()) {
      fail(`symlink install did not create a symlink under ${symlinkRoot}`);
    }
    const targetLink = fs.readlinkSync(symlinkDest);
    if (path.resolve(symlinkRoot, targetLink) !== repoRoot && path.resolve(targetLink) !== repoRoot) {
      fail(`symlink install does not point at ${repoRoot}`);
    }
    if (!fs.existsSync(path.join(symlinkDest, '.cursor-plugin', 'plugin.json'))) {
      fail('symlink install missing plugin manifest');
    }
    log(`install-local-plugin.ts --symlink produced a live link to ${repoRoot}`);

    execSync(`node --experimental-strip-types scripts/install-local-plugin.ts --target-root "${copyRoot}" --name oh-my-cursor --copy --force`, { cwd: repoRoot, stdio: 'ignore' });
    const copyPlugin = path.join(copyRoot, 'oh-my-cursor');
    const copyStat = fs.lstatSync(copyPlugin);
    if (copyStat.isSymbolicLink() || !copyStat.isDirectory()) {
      fail(`copy install did not produce a real directory at ${copyPlugin}`);
    }
    log(`install-local-plugin.ts --copy produced a runtime payload at ${copyPlugin}`);

    // Verify copy payload
    const copyManifestPath = path.join(copyPlugin, '.cursor-plugin', 'plugin.json');
    const copyManifest = JSON.parse(fs.readFileSync(copyManifestPath, 'utf-8'));
    const copyExpectations: Record<string, [string, string]> = {
      rules: ['dir', copyManifest.rules || defaults.rules],
      skills: ['dir', copyManifest.skills || defaults.skills],
      agents: ['dir', copyManifest.agents || defaults.agents],
      hooks: ['file', copyManifest.hooks || defaults.hooks],
      cursorRules: ['dir', defaults.cursorRules],
    };
    if (copyManifest.mcpServers) {
      copyExpectations.mcpServers = ['file', copyManifest.mcpServers];
    }

    const copyErrors: string[] = [];
    for (const [key, [kind, rel]] of Object.entries(copyExpectations)) {
      const fullPath = path.join(copyPlugin, rel);
      if (!fs.existsSync(fullPath)) {
        copyErrors.push(`copy payload missing ${rel} (manifest key ${key})`);
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (kind === 'dir' && !stat.isDirectory()) {
        copyErrors.push(`copy payload ${rel} expected to be dir (manifest key ${key})`);
      }
      if (kind === 'file' && !stat.isFile()) {
        copyErrors.push(`copy payload ${rel} expected to be file (manifest key ${key})`);
      }
    }

    // Required hook scripts
    const copyHooksDoc = JSON.parse(fs.readFileSync(path.join(copyPlugin, copyExpectations.hooks[1]), 'utf-8'));
    for (const [event, entries] of Object.entries(copyHooksDoc.hooks || {})) {
      for (const entry of (entries as any[])) {
        const cmd = entry.command || '';
        for (const token of cmd.split(/\s+/)) {
          if (token.endsWith('.ts')) {
            const script = path.join(copyPlugin, token);
            if (!fs.existsSync(script) || !fs.statSync(script).isFile()) {
              copyErrors.push(`hook ${event} references missing script ${token}`);
            }
          }
        }
      }
    }

    if (copyErrors.length > 0) {
      fail(copyErrors.join('\n'));
    }
    log('copy payload satisfies every discovery reference and hook command');

    // 5. hook scripts round-trip payloads
    const runHook = (label: string, script: string, payload: string) => {
      try {
        const stdout = execSync(`node --experimental-strip-types "${script}"`, {
          input: payload,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        JSON.parse(stdout);
      } catch (err: any) {
        fail(`${label}: ${script} did not emit valid JSON or raised on payload: ${payload}`);
      }
    };

    const claimGuard = path.join(copyPlugin, 'hooks', 'claim-guard.ts');
    const stopGate = path.join(copyPlugin, 'hooks', 'stop-gate.ts');
    if (!fs.existsSync(claimGuard)) fail('claim-guard.ts missing in copied plugin');
    if (!fs.existsSync(stopGate)) fail('stop-gate.ts missing in copied plugin');

    runHook('afterFileEdit (benign edit)', claimGuard, '{"event":"afterFileEdit","edited_files":["README.md"]}');
    runHook('afterFileEdit (no files)', claimGuard, '{"event":"afterFileEdit","edited_files":[]}');
    runHook('afterFileEdit (malformed)', claimGuard, 'not-json');
    runHook('afterFileEdit (empty stdin)', claimGuard, '');

    runHook('stop (ok status)', stopGate, '{"event":"stop","status":"ok","loop_count":0}');
    runHook('stop (error status)', stopGate, '{"event":"stop","status":"error","loop_count":0}');
    runHook('stop (malformed)', stopGate, 'not-json');
    runHook('stop (empty stdin)', stopGate, '');

    log('claim-guard.ts and stop-gate.ts emit valid JSON for benign, error, malformed, and empty inputs');

    // 6. optional model-backed prompt smoke
    if (RUN_PROMPT) {
      try {
        execSync('node --experimental-strip-types scripts/check-default-auth.ts', { cwd: repoRoot, stdio: 'ignore' });
      } catch {
        fail('cursor-agent default auth/model proof failed; cannot run prompt smoke');
      }

      const expected = 'OH_MY_CURSOR_PLUGIN_CLI_PROMPT_OK';
      const prompt = 'Without editing files or running shell commands, confirm the workspace contains a file named ' +
        '.cursor-plugin/plugin.json whose "name" field equals "oh-my-cursor". Reply with exactly: ' + expected;

      let output = '';
      try {
        output = execSync(`cursor-agent -p --output-format text --model auto --mode ask --trust --workspace "${copyPlugin}" "${prompt}"`, {
          timeout: TIMEOUT_SECONDS * 1000,
          encoding: 'utf-8',
        });
      } catch (err: any) {
        fail(`cursor-agent prompt smoke exited non-zero: ${err.message}. Output was: ${err.stdout}`);
      }

      if (!output.split('\n').map(l => l.trim()).includes(expected)) {
        console.error(output);
        fail(`cursor-agent prompt smoke missing sentinel ${expected}`);
      }
      log(`cursor-agent prompt smoke replied with ${expected} (read-only, plugin workspace)`);
    } else {
      log('model-backed prompt smoke skipped (set RUN_CURSOR_AGENT_PLUGIN_TEST_PROMPT=1 or pass --run-prompt to enable)');
    }

    if (KEEP_TARGET_ROOT) {
      log(`kept target root at ${TARGET_ROOT}`);
    }

    console.log(`OH_MY_CURSOR_PLUGIN_CLI_TEST_OK ${rawVersion}`);
  } finally {
    cleanup();
  }
}

main();
