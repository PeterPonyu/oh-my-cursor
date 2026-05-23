import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function log(msg: string): void {
  console.log(`ok: ${msg}`);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(`
Usage: node --experimental-strip-types scripts/check-default-auth.ts

Checks the local default Cursor auth/model state used by this machine.
`);
    process.exit(0);
  }

  try {
    execSync('command -v cursor-agent', { stdio: 'ignore' });
  } catch {
    fail('cursor-agent not found');
  }

  let whoamiOutput = '';
  try {
    whoamiOutput = execSync('cursor-agent whoami 2>&1', { encoding: 'utf-8' });
  } catch (err: any) {
    console.error(err.stdout || err.stderr || err.message);
    fail('cursor-agent whoami failed');
  }

  if (!/logged in/i.test(whoamiOutput)) {
    fail('cursor-agent whoami did not confirm login');
  }
  console.log(whoamiOutput.trim());
  console.log('CURSOR_AUTH_OK');
  log('default Cursor auth is available');

  const cfg = path.join(os.homedir(), '.cursor', 'cli-config.json');
  if (!fs.existsSync(cfg)) {
    fail(`missing config: ${cfg}`);
  }
  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(cfg, 'utf-8'));
  } catch (err: any) {
    fail(`failed to parse config JSON: ${err.message}`);
  }

  const auth = data.authInfo || {};
  const model = data.model || {};
  if (!auth.email) {
    fail('~/.cursor/cli-config.json missing authInfo.email');
  }
  if (!model.modelId) {
    fail('~/.cursor/cli-config.json missing model.modelId');
  }
  log(`cursor config auth user is ${auth.email}`);
  log(`cursor config default model is ${model.modelId}`);

  let configuredModel = '';
  try {
    configuredModel = execSync('node --experimental-strip-types scripts/resolve-cursor-model.ts', { encoding: 'utf-8' }).trim();
  } catch (err: any) {
    fail(`failed to resolve model: ${err.message}`);
  }

  let modelsOutput = '';
  try {
    modelsOutput = execSync('cursor-agent models 2>&1', { encoding: 'utf-8' });
  } catch (err: any) {
    console.error(err.stdout || err.stderr || err.message);
    fail('cursor-agent models failed');
  }

  if (/No models available for this account\./i.test(modelsOutput)) {
    console.log(`bounded: cursor-agent models returned no account model list; using configured default model ${configuredModel} for CLI smoke`);
  } else if (modelsOutput.includes(configuredModel)) {
    console.log('CURSOR_MODEL_CONFIGURED_OK');
    log('cursor-agent model list includes configured default model');
  } else if (/auto - Auto/i.test(modelsOutput)) {
    console.log('CURSOR_MODEL_AUTO_OK');
    log('cursor-agent exposes the auto model');
  } else {
    console.error(modelsOutput);
    fail('cursor-agent models did not include configured default model or auto');
  }
}

main();
