import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

function loadConfig(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function parameterValues(config: any, modelId: string): Record<string, string> {
  const selected = config.selectedModel || {};
  const params = selected.parameters || (config.modelParameters || {})[modelId] || [];
  const values: Record<string, string> = {};
  if (Array.isArray(params)) {
    for (const item of params) {
      if (item && item.id !== undefined && item.id !== null) {
        values[String(item.id)] = String(item.value);
      }
    }
  }
  return values;
}

function candidateModels(config: any): string[] {
  const candidates: string[] = [];
  const add = (val: any) => {
    if (typeof val === 'string' && val && !candidates.includes(val)) {
      candidates.push(val);
    }
  };

  const model = config.model || {};
  const selected = config.selectedModel || {};
  const modelId = String(model.modelId || selected.modelId || '');
  const displayModelId = String(model.displayModelId || '');

  add(modelId);
  add(displayModelId);

  const values = parameterValues(config, modelId);
  const reasoning = (values.reasoning || '').replace(/_/g, '-');
  const fast = (values.fast || '').toLowerCase() === 'true';

  if (modelId && reasoning) {
    add(`${modelId}-${reasoning}${fast ? '-fast' : ''}`);
    add(`${modelId}-${reasoning}`);
  }
  if (modelId) {
    for (const suffix of ['extra-high', 'xhigh', 'high', 'medium', 'low', 'none']) {
      add(`${modelId}-${suffix}${fast ? '-fast' : ''}`);
      add(`${modelId}-${suffix}`);
    }
  }
  add('auto');
  return candidates;
}

function listModels(): string {
  try {
    return execSync('cursor-agent --list-models 2>&1', { timeout: 30000, encoding: 'utf-8' });
  } catch {
    try {
      return execSync('cursor-agent models 2>&1', { timeout: 30000, encoding: 'utf-8' });
    } catch {
      return '';
    }
  }
}

function listedModelIds(output: string): Set<string> {
  const ids = new Set<string>();
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('No models available')) {
      continue;
    }
    const parts = stripped.split(/\s+-\s+|\s+/);
    if (parts[0]) {
      ids.add(parts[0]);
    }
  }
  return ids;
}

export function resolveModel(configPath: string, prefer: string = ''): string {
  if (prefer) {
    return prefer;
  }
  const envModel = (process.env.CURSOR_SMOKE_MODEL || '').trim();
  if (envModel) {
    return envModel;
  }

  const config = loadConfig(configPath);
  const candidates = candidateModels(config);
  const listed = listedModelIds(listModels());
  if (listed.size > 0) {
    for (const candidate of candidates) {
      if (listed.has(candidate)) {
        return candidate;
      }
    }
  }

  return candidates[0] || 'auto';
}

function expandUser(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

function main() {
  const args = process.argv.slice(2);
  let configPath = path.join(os.homedir(), '.cursor', 'cli-config.json');
  let prefer = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') {
      configPath = path.resolve(expandUser(args[i + 1]));
      i++;
    } else if (args[i] === '--prefer') {
      prefer = args[i + 1];
      i++;
    }
  }

  console.log(resolveModel(configPath, prefer));
}

main();
