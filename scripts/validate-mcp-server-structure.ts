import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function note(msg: string): void {
  console.log(`note: ${msg}`);
}

function log(msg: string): void {
  console.log(`ok: ${msg}`);
}

const REQUIRED_FILES = [
  'mcp/cursor-state-bridge/index.ts',
  'mcp/cursor-state-bridge/server.ts',
  'mcp/cursor-state-bridge/jail.ts',
  'mcp/cursor-state-bridge/fixtures/mcp.example.canonical.json',
  'mcp/cursor-state-bridge/fixtures/trace-schema.json',
];

const OPTIONAL_FILES = [
  'mcp/cursor-state-bridge/README.md',
];

async function main() {
  for (const rel of REQUIRED_FILES) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
      fail(`missing required file: ${rel}`);
    }
    log(`present: ${rel}`);
  }

  for (const rel of OPTIONAL_FILES) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      note(`optional file not yet present: ${rel}`);
    } else {
      log(`present (optional): ${rel}`);
    }
  }

  // Compile check using Node's check flag
  const pkgDir = path.join(ROOT, 'mcp', 'cursor-state-bridge');
  const tsFiles = fs.readdirSync(pkgDir)
    .filter(f => f.endsWith('.ts'))
    .map(f => path.join(pkgDir, f));

  for (const file of tsFiles) {
    try {
      execSync(`node --experimental-strip-types --check "${file}"`, { stdio: 'ignore' });
    } catch (err: any) {
      fail(`syntax error in ${path.relative(ROOT, file)}: ${err.message}`);
    }
    log(`compiles: ${path.relative(ROOT, file)}`);
  }

  // Network check
  const serverTsPath = path.join(pkgDir, 'server.ts');
  const serverText = fs.readFileSync(serverTsPath, 'utf-8');

  const FORBIDDEN_NETWORK_PATTERNS = [
    /net\.createServer/,
    /net\.connect/,
    /http\.createServer/,
    /express/,
    /fastify/,
  ];

  for (const pattern of FORBIDDEN_NETWORK_PATTERNS) {
    if (pattern.test(serverText)) {
      fail(`server.ts contains forbidden network import/use: ${pattern}`);
    }
  }
  log('server.ts: no forbidden network imports');

  // Tool literals check
  const REQUIRED_STATE_TOOL_NAMES = [
    'state_read',
    'state_init',
    'state_set_phase',
    'state_record_failure',
    'state_update_acceptance_criterion',
    'state_history_append',
  ];
  const REQUIRED_MEMORY_TOOL_NAMES = [
    'memory_notepad_read',
    'memory_notepad_append_working',
    'memory_project_memory_read',
    'memory_project_memory_set_directive',
    'memory_wiki_log_append',
  ];
  const REQUIRED_TOOL_NAMES = [...REQUIRED_STATE_TOOL_NAMES, ...REQUIRED_MEMORY_TOOL_NAMES];

  for (const tool of REQUIRED_STATE_TOOL_NAMES) {
    const pattern = new RegExp(`['"]${tool}['"]`);
    if (!pattern.test(serverText)) {
      fail(`server.ts does not contain required tool name as string literal: ${tool}`);
    }
  }
  log(`server.ts: all ${REQUIRED_STATE_TOOL_NAMES.length} required state tool names present`);

  // Dynamically load server.ts and validate schema structure
  let serverModule: any;
  try {
    serverModule = await import(serverTsPath);
  } catch (err: any) {
    fail(`could not load server module for schema validation: ${err.message}`);
  }

  const tools = serverModule.TOOLS;
  if (!Array.isArray(tools)) {
    fail("server.ts must expose TOOLS as a list");
  }

  const schemas: Record<string, any> = {};
  for (const tool of tools) {
    if (typeof tool !== 'object' || tool === null) {
      continue;
    }
    const name = tool.name;
    if (typeof name !== 'string') {
      continue;
    }
    const schema = tool.inputSchema;
    if (typeof schema !== 'object' || schema === null) {
      fail(`tool ${name} missing inputSchema object`);
    }
    schemas[name] = schema;
  }

  const expectedToolSet = new Set(REQUIRED_TOOL_NAMES);
  const schemaNames = Object.keys(schemas);
  if (schemaNames.length !== expectedToolSet.size || !schemaNames.every(n => expectedToolSet.has(n))) {
    fail(`tools/list drift: expected ${REQUIRED_TOOL_NAMES.sort().join(', ')}, got ${schemaNames.sort().join(', ')}`);
  }

  const functionalTools = serverModule.FUNCTIONAL_TOOLS;
  if (typeof functionalTools !== 'object' || functionalTools === null) {
    fail("server.ts must expose FUNCTIONAL_TOOLS as an object");
  }
  const funcNames = Object.keys(functionalTools);
  if (funcNames.length !== expectedToolSet.size || !funcNames.every(n => expectedToolSet.has(n))) {
    fail(`functional tool map drift: expected ${REQUIRED_TOOL_NAMES.sort().join(', ')}, got ${funcNames.sort().join(', ')}`);
  }

  const stateIoModule = await import(path.join(pkgDir, 'state_io.ts'));
  const memoryIoModule = await import(path.join(pkgDir, 'memory_io.ts'));
  const expectedStateSet = new Set(REQUIRED_STATE_TOOL_NAMES);
  const expectedMemorySet = new Set(REQUIRED_MEMORY_TOOL_NAMES);
  for (const [tool, handler] of Object.entries(functionalTools)) {
    if (typeof handler !== 'function') {
      fail(`functional tool ${tool} must map to a function handler`);
    }
    const sourceModule = expectedStateSet.has(tool) ? stateIoModule : expectedMemorySet.has(tool) ? memoryIoModule : null;
    if (!sourceModule || sourceModule[tool] !== handler) {
      fail(`functional tool ${tool} does not match exported handler in state_io.ts or memory_io.ts`);
    }
  }

  const stateHandlers = Object.keys(stateIoModule).filter(name => name.startsWith('state_') && typeof stateIoModule[name] === 'function');
  if (stateHandlers.length !== expectedStateSet.size || !stateHandlers.every(n => expectedStateSet.has(n))) {
    fail(`state_io handler drift: expected ${REQUIRED_STATE_TOOL_NAMES.sort().join(', ')}, got ${stateHandlers.sort().join(', ')}`);
  }

  const memoryHandlers = Object.keys(memoryIoModule).filter(name => name.startsWith('memory_') && typeof memoryIoModule[name] === 'function');
  if (memoryHandlers.length !== expectedMemorySet.size || !memoryHandlers.every(n => expectedMemorySet.has(n))) {
    fail(`memory_io handler drift: expected ${REQUIRED_MEMORY_TOOL_NAMES.sort().join(', ')}, got ${memoryHandlers.sort().join(', ')}`);
  }

  const serverInstance = new serverModule.Server(ROOT);
  const capabilities = serverInstance.handleInitialize().capabilities;
  if (JSON.stringify(capabilities) !== JSON.stringify({ tools: {} })) {
    fail(`cursor-state-bridge must advertise only tools capability, got ${JSON.stringify(capabilities)}`);
  }

  const EXPECTED_SCHEMA_PROPERTIES: Record<string, Set<string>> = {
    state_read: new Set(['task_id', 'workspace']),
    state_init: new Set([
      'task_id',
      'plan_id',
      'title',
      'phase',
      'status',
      'role',
      'next_action',
      'scope_per_task',
      'history_cap',
    ]),
    state_set_phase: new Set([
      'task_id',
      'phase',
      'status',
      'role',
      'next_action',
      'note',
      'history_cap',
    ]),
    state_record_failure: new Set(['task_id', 'message', 'type', 'note', 'retry_count', 'history_cap']),
    state_update_acceptance_criterion: new Set([
      'task_id',
      'ac_id',
      'status',
      'criterion',
      'evidence',
      'note',
      'history_cap',
    ]),
    state_history_append: new Set(['task_id', 'event', 'note', 'phase', 'status', 'history_cap']),
    memory_notepad_read: new Set(['path', 'workspace']),
    memory_notepad_append_working: new Set(['note', 'path', 'workspace']),
    memory_project_memory_read: new Set(['path', 'workspace']),
    memory_project_memory_set_directive: new Set(['directive', 'path', 'workspace']),
    memory_wiki_log_append: new Set(['action', 'slug', 'note', 'path', 'workspace']),
  };

  for (const [tool, expectedProps] of Object.entries(EXPECTED_SCHEMA_PROPERTIES)) {
    const schema = schemas[tool];
    if (!schema || typeof schema !== 'object') {
      fail(`${tool} missing inputSchema`);
    }
    const props = schema.properties;
    if (typeof props !== 'object' || props === null) {
      fail(`${tool} inputSchema missing properties`);
    }
    const actualProps = Object.keys(props);
    if (actualProps.length !== expectedProps.size || !actualProps.every(p => expectedProps.has(p))) {
      fail(`${tool} schema properties drift: expected ${Array.from(expectedProps).sort().join(', ')}, got ${actualProps.sort().join(', ')}`);
    }
  }

  const failureProps = schemas.state_record_failure.properties;
  if ('phase' in failureProps) {
    fail("state_record_failure schema must not advertise unused phase param");
  }
  if (!('type' in failureProps)) {
    fail("state_record_failure schema must advertise failure type");
  }

  const historySchema = schemas.state_history_append;
  if (JSON.stringify(historySchema.required) !== JSON.stringify(['task_id'])) {
    fail("state_history_append should require task_id and accept event or note");
  }
  if (!Array.isArray(historySchema.anyOf)) {
    fail("state_history_append should express event/note alias via anyOf");
  }

  log("server.ts: MCP tool schemas match state_io handler contract");

  const stateIoTsPath = path.join(pkgDir, 'state_io.ts');
  const stateIoText = fs.readFileSync(stateIoTsPath, 'utf-8');
  if (!stateIoText.includes('src/oh_my_cursor/workflow_state')) {
    fail("state_io.ts must import the packaged workflow-state API");
  }
  if (stateIoText.includes('importlib') || stateIoText.includes('workflow-state.py')) {
    fail("state_io.ts must not reference python workspace modules");
  }
  log("state_io.ts: imports packaged workflow-state API, not workspace Python");

  console.log("MCP_SERVER_STRUCTURE_OK");
}

main().catch(err => {
  console.error("FAIL:", err);
  process.exit(1);
});
