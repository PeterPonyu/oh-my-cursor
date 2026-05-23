import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveRepoRoot, resolveWorkspaceRoot } from './_repo.ts';
import { trace } from './_trace.ts';
import { extractFilePath, extractToolName } from './_tool_payload.ts';

const currentFile = fileURLToPath(import.meta.url);
const PAYLOAD_ROOT = resolveRepoRoot(currentFile);
const WORKSPACE_ROOT = resolveWorkspaceRoot(currentFile);

const SCHEMA_PATH = path.join(PAYLOAD_ROOT, '.cursor', 'state', 'workflow-state.schema.json');
const DEFAULT_STATE_PATH = path.join(WORKSPACE_ROOT, '.cursor', 'state', 'workflow-state.json');

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const BRIDGE_WRITE_TOOLS = new Set([
  'state_init',
  'state_set_phase',
  'state_record_failure',
  'state_update_acceptance_criterion',
  'state_history_append',
]);

const MCP_PREFIX = 'mcp__cursor-state-bridge__';

function readPayload(): any {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw.trim()) {
      return {};
    }
    return JSON.parse(raw);
  } catch (err: any) {
    return { _invalid_json: true };
  }
}

function resolveBridgeCall(toolName: string, payload: any): [string, string] {
  let inner = '';
  if (toolName.startsWith(MCP_PREFIX)) {
    inner = toolName.slice(MCP_PREFIX.length);
  } else if (toolName === 'tools/call') {
    const toolInput = payload?.tool_input;
    if (toolInput && typeof toolInput === 'object') {
      const candidate = toolInput.name;
      if (typeof candidate === 'string') {
        inner = candidate.startsWith(MCP_PREFIX) ? candidate.slice(MCP_PREFIX.length) : candidate;
      }
    }
  } else if (BRIDGE_WRITE_TOOLS.has(toolName)) {
    inner = toolName;
  }

  if (!BRIDGE_WRITE_TOOLS.has(inner)) {
    return ['', ''];
  }

  let argumentsObj: any = {};
  const toolInput = payload?.tool_input;
  if (toolInput && typeof toolInput === 'object') {
    const nested = toolInput.arguments;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      argumentsObj = nested;
    } else {
      argumentsObj = toolInput;
    }
  }
  const taskId = typeof argumentsObj?.task_id === 'string' ? argumentsObj.task_id : '';
  if (taskId) {
    return [inner, path.join(WORKSPACE_ROOT, 'docs', 'plans', taskId, 'workflow-state.json')];
  }
  return [inner, DEFAULT_STATE_PATH];
}

function validateAgainstSchema(document: any, schema: any): string[] {
  const errors: string[] = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    errors.push('state document root must be an object');
    return errors;
  }
  const required = schema?.required;
  if (Array.isArray(required)) {
    for (const field of required) {
      if (!(field in document)) {
        errors.push(`missing required field: ${field}`);
      }
    }
  }
  const properties = schema?.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const [field, value] of Object.entries(document)) {
      const spec = properties[field];
      if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
        const enumList = spec.enum;
        if (Array.isArray(enumList) && !enumList.includes(value)) {
          errors.push(`field ${field} must be one of ${[...enumList].sort().map(String).join(', ')}`);
        }
      }
    }
  }
  const criteria = document.acceptance_criteria;
  if (Array.isArray(criteria)) {
    const acStatuses = new Set(['pending', 'passed', 'failed', 'skipped']);
    for (let index = 0; index < criteria.length; index++) {
      const item = criteria[index];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`acceptance_criteria[${index}] must be an object`);
        continue;
      }
      for (const key of ['id', 'criterion', 'status']) {
        if (!(key in item)) {
          errors.push(`acceptance_criteria[${index}] missing required field: ${key}`);
        }
      }
      const status = item.status;
      if (typeof status === 'string' && !acStatuses.has(status)) {
        errors.push(`acceptance_criteria[${index}].status must be one of ${[...acStatuses].sort().join(', ')}`);
      }
    }
  }
  const failure = document.failure;
  if (failure && typeof failure === 'object' && !Array.isArray(failure)) {
    const retry = failure.retry_count;
    if (typeof retry === 'number' && (retry < 0 || retry > 3)) {
      errors.push('failure.retry_count must be between 0 and 3');
    }
  }
  return errors;
}

function main(): number {
  const payload = readPayload();
  if (payload?._invalid_json) {
    console.log(JSON.stringify({
      status: 'pass',
      fail_open: true,
      additional_context: '',
      message: 'State-watcher input was not JSON; skipped.'
    }));
    return 0;
  }

  const toolName = extractToolName(payload);
  const filePath = extractFilePath(payload);
  const basename = filePath ? path.posix.basename(filePath.replace(/\\/g, '/')) : '';

  const [bridgeTool, bridgeTarget] = resolveBridgeCall(toolName, payload);
  const isDirectEdit = EDIT_TOOLS.has(toolName) && basename === 'workflow-state.json';

  if (!isDirectEdit && !bridgeTool) {
    trace({
      hook: 'state-watcher',
      event: 'postToolUse',
      status: 'pass',
      checked: false,
      tool_name: toolName,
      file_basename: basename
    });
    console.log(JSON.stringify({ status: 'pass', fail_open: true, additional_context: '', checked: false }));
    return 0;
  }

  let resolvedPath = bridgeTool ? bridgeTarget : filePath;
  if (resolvedPath.startsWith('~')) {
    const homedir = process.env.HOME || '';
    resolvedPath = path.join(homedir, resolvedPath.slice(1));
  }
  if (!path.isAbsolute(resolvedPath)) {
    resolvedPath = path.resolve(WORKSPACE_ROOT, resolvedPath);
  }

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    console.log(JSON.stringify({
      status: 'pass',
      fail_open: true,
      additional_context: 'State-watcher could not read the edited workflow-state file from disk.',
      checked: false,
      file_path: resolvedPath,
      bridge_tool: bridgeTool,
    }));
    return 0;
  }

  let document: any;
  try {
    document = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  } catch (exc: any) {
    console.log(JSON.stringify({
      status: 'pass',
      fail_open: true,
      additional_context: `State-watcher could not parse the workflow-state JSON: ${exc?.message || exc}.`,
      checked: false,
      file_path: resolvedPath,
      bridge_tool: bridgeTool,
    }));
    return 0;
  }

  let schema: any = {};
  if (fs.existsSync(SCHEMA_PATH) && fs.statSync(SCHEMA_PATH).isFile()) {
    try {
      schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    } catch {
      schema = {};
    }
  }

  const errors = validateAgainstSchema(document, schema);
  let status = 'pass';
  let additionalContext = '';

  if (errors.length > 0) {
    additionalContext = (
      'State-watcher detected schema issues in the edited workflow-state document: ' +
      errors.slice(0, 8).join('; ') +
      '. Use scripts/validate-workflow-state.py for the full validator output.'
    );
    status = 'warning';
  } else {
    additionalContext = 'State-watcher confirmed the edited workflow-state document still matches .cursor/state/workflow-state.schema.json.';
    status = 'pass';
  }

  trace({
    hook: 'state-watcher',
    event: 'postToolUse',
    status,
    checked: true,
    tool_name: toolName,
    bridge_tool: bridgeTool,
    file_basename: basename,
    error_count: errors.length,
    first_errors: errors.slice(0, 4),
  });

  console.log(JSON.stringify({
    status,
    fail_open: true,
    checked: true,
    additional_context: additionalContext,
    file_path: resolvedPath,
    bridge_tool: bridgeTool,
    errors: errors.slice(0, 16),
  }).replace(/":/g, '": '));
  return 0;
}

process.exit(main());
