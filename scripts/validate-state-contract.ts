import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function log(msg: string): void {
  console.log(`ok: ${msg}`);
}

function main() {
  const cursorCfg = path.join(os.homedir(), '.cursor', 'cli-config.json');
  const repoCliCfg = path.join(ROOT, '.cursor', 'cli-config.json');

  if (fs.existsSync(repoCliCfg)) {
    fail('.cursor/cli-config.json must stay user-level, not checked into the repo');
  }

  if (fs.existsSync(path.join(ROOT, '.cursor', 'mcp.json'))) {
    fail('.cursor/mcp.json should not be checked in before a concrete MCP choice');
  }

  if (fs.existsSync(path.join(ROOT, '.cursor', 'memories'))) {
    fail('.cursor/memories should not be checked in for the backbone');
  }

  const gitignorePath = path.join(ROOT, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fail('.gitignore missing');
  }
  const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
  for (const required of ['.cursor/mcp.json', '.cursor/memories/', '.omc/', '.cursor-worktree/']) {
    if (!gitignore.includes(required)) {
      fail(`.gitignore missing ${required}`);
    }
  }
  log('.gitignore blocks speculative Cursor state files');

  if (!fs.existsSync(cursorCfg)) {
    console.log(`bounded: no user-level Cursor CLI config found at ${cursorCfg}; auth/model runtime proof remains environment-gated`);
  } else {
    try {
      const cfg = JSON.parse(fs.readFileSync(cursorCfg, 'utf-8'));
      const auth = cfg.authInfo || {};
      const model = cfg.model || {};
      const email = auth.email;
      const modelId = model.modelId;
      log(`user-level Cursor auth/model state is stored outside the repo: ${cursorCfg}`);
      if (email) {
        log(`cursor auth user is ${email}`);
      } else {
        console.log('bounded: ~/.cursor/cli-config.json lacks authInfo.email; auth proof remains environment-gated');
      }
      if (modelId) {
        log(`cursor default model is ${modelId}`);
      } else {
        console.log('bounded: ~/.cursor/cli-config.json lacks model.modelId; model proof remains environment-gated');
      }
    } catch (err: any) {
      console.log(`bounded: could not parse ${cursorCfg}; auth/model runtime proof remains environment-gated (${err.message})`);
    }
  }

  log('Cursor state contract validation complete');
}

main();
