import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const EXPECTED_AGENT_READONLY: Record<string, string> = {
  architect: 'true',
  'code-reviewer': 'true',
  critic: 'true',
  debugger: 'false',
  explore: 'true',
  implementer: 'false',
  orchestrator: 'false',
  planner: 'true',
  'qa-tester': 'true',
  researcher: 'true',
  'security-reviewer': 'true',
  'test-engineer': 'false',
  tracer: 'true',
  verifier: 'true',
};

const EXPECTED_SKILLS = new Set([
  'auto-execute',
  'debug',
  'decisions',
  'deep-interview',
  'doctor',
  'iterate-loop',
  'local-plugin-check',
  'mcp-setup',
  'notepad',
  'parallel-batch',
  'phase-controller',
  'plan',
  'remember',
  'review',
  'rules-authoring',
  'security-review',
  'team-controller',
  'trace',
  'verify',
  'wiki',
]);

const BASE_MCP_TOOL_NAMES = new Set([
  'state_read',
  'state_init',
  'state_set_phase',
  'state_record_failure',
  'state_update_acceptance_criterion',
  'state_history_append',
]);

const MEMORY_MCP_TOOL_NAMES = new Set([
  'memory_notepad_read',
  'memory_notepad_append_working',
  'memory_project_memory_read',
  'memory_project_memory_set_directive',
  'memory_wiki_log_append',
]);

const MCP_TOOL_NAMES = new Set([...BASE_MCP_TOOL_NAMES, ...MEMORY_MCP_TOOL_NAMES]);

const EXPECTED_AGENT_MCP_TOOLS: Record<string, Set<string>> = {
  architect: new Set(['state_read']),
  'code-reviewer': new Set(['state_read']),
  critic: new Set(['state_read']),
  debugger: new Set(['state_read', 'state_record_failure', 'state_history_append']),
  explore: new Set(['state_read']),
  implementer: new Set(['state_read', 'state_set_phase', 'state_update_acceptance_criterion', 'state_history_append']),
  orchestrator: MCP_TOOL_NAMES,
  planner: new Set(['state_read']),
  'qa-tester': new Set(['state_read', 'state_update_acceptance_criterion', 'state_history_append']),
  researcher: new Set(['state_read']),
  'security-reviewer': new Set(['state_read']),
  'test-engineer': new Set(['state_read', 'state_set_phase', 'state_update_acceptance_criterion']),
  tracer: new Set(['state_read', 'state_history_append']),
  verifier: new Set(['state_read', 'state_update_acceptance_criterion']),
};

const EXPECTED_SKILL_MCP_TOOLS: Record<string, Set<string>> = {
  'auto-execute': new Set(['state_init', 'state_set_phase', 'state_record_failure', 'state_update_acceptance_criterion']),
  debug: new Set(),
  decisions: new Set(),
  'deep-interview': new Set(),
  doctor: new Set(),
  'iterate-loop': new Set(['state_read', 'state_record_failure', 'state_update_acceptance_criterion', 'state_history_append']),
  'local-plugin-check': new Set(),
  'mcp-setup': MCP_TOOL_NAMES,
  notepad: new Set(['memory_notepad_read', 'memory_notepad_append_working']),
  'parallel-batch': new Set(),
  'phase-controller': BASE_MCP_TOOL_NAMES,
  plan: new Set(),
  remember: new Set([
    'memory_notepad_append_working',
    'memory_project_memory_set_directive',
    'memory_wiki_log_append',
    'state_history_append',
  ]),
  review: new Set(),
  'rules-authoring': new Set(),
  'security-review': new Set(),
  'team-controller': new Set(),
  trace: new Set(),
  verify: new Set(['state_read', 'state_update_acceptance_criterion', 'state_history_append']),
  wiki: new Set(['memory_wiki_log_append']),
};

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function loadJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (exc: any) {
    fail(`could not parse ${path.relative(ROOT, filePath)}: ${exc.message || exc}`);
  }
}

function commandPath(command: string): string | null {
  // Simple shlex-like parsing for scripts/command line
  const parts = command.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    if (part.endsWith('.ts') || part.startsWith('hooks/')) {
      const candidate = path.resolve(ROOT, part);
      const hooksDir = path.resolve(ROOT, 'hooks');
      if (candidate.startsWith(hooksDir)) {
        return candidate;
      }
    }
  }
  return null;
}

function* iterHookEntries(value: any): Generator<any> {
  if (typeof value === 'string') {
    yield { command: value };
  } else if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      for (const item of value) {
        yield* iterHookEntries(item);
      }
    } else {
      yield value;
    }
  }
}

function helperImports(filePath: string): Set<string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const matches = content.matchAll(/from\s+['"]\.\/(_[A-Za-z0-9_-]+)\.ts['"]/g);
  const helpers = new Set<string>();
  for (const match of matches) {
    helpers.add(match[1] + '.ts');
  }
  return helpers;
}

function mcpToolsFromText(text: string): Set<string> {
  const matches = text.matchAll(/(?:mcp__cursor-state-bridge__)?((?:state|memory)_[a-z_]+)/g);
  const tools = new Set<string>();
  for (const match of matches) {
    if (MCP_TOOL_NAMES.has(match[1])) {
      tools.add(match[1]);
    }
  }
  return tools;
}

function getSection(text: string, startHeading: string, endHeading: string): string {
  const lower = text.toLowerCase();
  const start = lower.indexOf(startHeading.toLowerCase());
  if (start === -1) return '';
  const end = lower.indexOf(endHeading.toLowerCase(), start + startHeading.length);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

function validateHooks(): void {
  const hooksPath = path.join(ROOT, 'hooks', 'hooks.json');
  if (!fs.existsSync(hooksPath)) {
    fail('missing hooks/hooks.json');
  }
  const data = loadJson(hooksPath);
  if (data.version !== 1) {
    fail('hooks/hooks.json must use version 1');
  }
  const hooks = data.hooks;
  if (!hooks || typeof hooks !== 'object') {
    fail('hooks/hooks.json must contain a hooks object');
  }

  const requiredEvents: Record<string, string> = {
    sessionStart: 'hooks/session-bootstrap.ts',
    sessionEnd: 'hooks/session-summary.ts',
    beforeSubmitPrompt: 'hooks/prompt-router.ts',
    preToolUse: 'hooks/tool-guard.ts',
    postToolUse: 'hooks/state-watcher.ts',
    postToolUseFailure: 'hooks/failure-router.ts',
    subagentStart: 'hooks/subagent-bootstrap.ts',
    subagentStop: 'hooks/subagent-summary.ts',
    beforeShellExecution: 'hooks/shell-guard.ts',
    afterShellExecution: 'hooks/shell-debrief.ts',
    beforeReadFile: 'hooks/read-advisor.ts',
    afterFileEdit: 'hooks/claim-guard.ts',
    preCompact: 'hooks/compact-reminder.ts',
    stop: 'hooks/stop-gate.ts',
  };

  const extraEvents = Object.keys(hooks).filter(e => !(e in requiredEvents));
  if (extraEvents.length > 0) {
    fail(`unexpected hook events in hooks/hooks.json: ${extraEvents.sort().join(', ')}`);
  }

  for (const [event, expectedScript] of Object.entries(requiredEvents)) {
    const entries = Array.from(iterHookEntries(hooks[event]));
    if (entries.length === 0) {
      fail(`missing hook event ${event}`);
    }
    const commands: string[] = [];
    for (const entry of entries) {
      if (entry && typeof entry === 'object' && typeof entry.command === 'string') {
        commands.push(entry.command);
      }
    }
    if (!commands.some(c => c.includes(expectedScript))) {
      fail(`${event} must call ${expectedScript}`);
    }
    for (const command of commands) {
      const scriptPath = commandPath(command);
      if (!scriptPath) {
        fail(`could not identify script path in hook command: ${command}`);
      }
      if (!fs.existsSync(scriptPath)) {
        fail(`hook command path does not exist: ${path.relative(ROOT, scriptPath)}`);
      }
      try {
        execSync(`node --experimental-strip-types --check "${scriptPath}"`, { stdio: 'ignore' });
      } catch (err: any) {
        fail(`TS/JS syntax check failed for: ${path.relative(ROOT, scriptPath)}`);
      }
    }
  }

  const stopEntries = Array.from(iterHookEntries(hooks.stop));
  if (!stopEntries.some(entry => entry.loop_limit === 0 || entry.loop_limit === 1)) {
    fail('stop hook must include a conservative loop_limit');
  }

  const traceHelper = path.join(ROOT, 'hooks', '_trace.ts');
  if (!fs.existsSync(traceHelper)) {
    fail('missing hooks/_trace.ts shared trace helper');
  }
  try {
    execSync(`node --experimental-strip-types --check "${traceHelper}"`, { stdio: 'ignore' });
  } catch (err: any) {
    fail(`TS/JS syntax check failed for: ${path.relative(ROOT, traceHelper)}`);
  }

  const referenced = new Set(Object.values(requiredEvents).map(p => path.basename(p)));
  const hookFiles = fs.readdirSync(path.join(ROOT, 'hooks')).filter(f => f.endsWith('.ts'));
  const helperFiles = hookFiles.filter(f => f.startsWith('_'));
  const entrypointFiles = hookFiles.filter(f => !f.startsWith('_'));

  const orphanEntrypoints = entrypointFiles.filter(f => !referenced.has(f));
  if (orphanEntrypoints.length > 0) {
    fail(`orphan hook entrypoint files not referenced by hooks/hooks.json: ${orphanEntrypoints.sort().join(', ')}`);
  }

  const importedHelpers = new Set<string>();
  for (const file of hookFiles) {
    const helpers = helperImports(path.join(ROOT, 'hooks', file));
    for (const h of helpers) {
      importedHelpers.add(h);
    }
  }
  const orphanHelpers = helperFiles.filter(f => !importedHelpers.has(f));
  if (orphanHelpers.length > 0) {
    fail(`orphan hook helper files not imported by any hook: ${orphanHelpers.sort().join(', ')}`);
  }

  console.log('HOOKS_ARTIFACTS_OK');
}

function parseFrontmatter(filePath: string): [Record<string, string>, string] {
  const text = fs.readFileSync(filePath, 'utf-8');
  if (!text.startsWith('---\n')) {
    fail(`${path.relative(ROOT, filePath)} missing YAML frontmatter`);
  }
  const end = text.indexOf('\n---', 4);
  if (end === -1) {
    fail(`${path.relative(ROOT, filePath)} has unterminated YAML frontmatter`);
  }
  const raw = text.slice(4, end).trim().split(/\r?\n/);
  const frontmatter: Record<string, string> = {};
  for (const line of raw) {
    if (!line.trim()) continue;
    if (!line.includes(':')) {
      fail(`${path.relative(ROOT, filePath)} has invalid frontmatter line: ${line}`);
    }
    const colonIndex = line.indexOf(':');
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
    frontmatter[key] = value;
  }
  return [frontmatter, text.slice(end + 4).trim()];
}

function validateAgents(): void {
  const agentsDir = path.join(ROOT, 'agents');
  if (!fs.existsSync(agentsDir)) {
    fail('missing agents/ directory');
  }
  const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort();
  const expected = new Set(Object.keys(EXPECTED_AGENT_READONLY));
  const names = new Set<string>();

  for (const file of agents) {
    const filePath = path.join(agentsDir, file);
    const [frontmatter, body] = parseFrontmatter(filePath);
    for (const key of ['name', 'description', 'model', 'readonly', 'tools']) {
      if (!frontmatter[key]) {
        fail(`${path.relative(ROOT, filePath)} missing frontmatter key ${key}`);
      }
    }
    const name = frontmatter.name;
    if (!KEBAB_RE.test(name)) {
      fail(`agent name must be kebab-case: ${name}`);
    }
    if (name !== path.basename(file, '.md')) {
      fail(`agent file name must match frontmatter name: ${file}`);
    }
    if (frontmatter.readonly !== 'true' && frontmatter.readonly !== 'false') {
      fail(`agent readonly must be true or false: ${file}`);
    }
    if (name in EXPECTED_AGENT_READONLY && frontmatter.readonly !== EXPECTED_AGENT_READONLY[name]) {
      fail(`agent readonly policy drift for ${name}: expected ${EXPECTED_AGENT_READONLY[name]}, got ${frontmatter.readonly}`);
    }
    if (frontmatter.model !== 'auto') {
      fail(`agent model must remain auto unless benchmark evidence updates policy: ${file}`);
    }
    if (!frontmatter.description.startsWith('[OMCS]')) {
      fail(`agent description must start with [OMCS]: ${file}`);
    }
    const declaredMcp = mcpToolsFromText(frontmatter.tools || '');
    const unknownMcp = Array.from(declaredMcp).filter(t => !MCP_TOOL_NAMES.has(t));
    if (unknownMcp.length > 0) {
      fail(`agent ${name} declares unknown MCP tools: ${unknownMcp.sort().join(', ')}`);
    }
    const expectedMcp = EXPECTED_AGENT_MCP_TOOLS[name] || new Set();
    const declaredMcpArr = Array.from(declaredMcp).sort();
    const expectedMcpArr = Array.from(expectedMcp).sort();
    if (JSON.stringify(declaredMcpArr) !== JSON.stringify(expectedMcpArr)) {
      fail(`agent ${name} MCP tool policy drift: expected ${expectedMcpArr.join(', ')}, got ${declaredMcpArr.join(', ')}`);
    }
    const bodyMcp = mcpToolsFromText(body);
    const missingBodyMentions = Array.from(expectedMcp).filter(t => !bodyMcp.has(t));
    if (missingBodyMentions.length > 0) {
      fail(`agent ${name} body does not document MCP tools: ${missingBodyMentions.sort().join(', ')}`);
    }
    if (!body) {
      fail(`agent body must not be empty: ${file}`);
    }
    names.add(name);
  }

  const missing = Array.from(expected).filter(n => !names.has(n));
  if (missing.length > 0) {
    fail(`missing required agents: ${missing.sort().join(', ')}`);
  }
  const extra = Array.from(names).filter(n => !expected.has(n));
  if (extra.length > 0) {
    fail(`unexpected ungoverned agents: ${extra.sort().join(', ')}`);
  }
  console.log('AGENTS_ARTIFACTS_OK');
}

function validateSkills(): void {
  const skillsDir = path.join(ROOT, 'skills');
  if (!fs.existsSync(skillsDir)) {
    fail('missing skills/ directory');
  }
  const skills = fs.readdirSync(skillsDir).filter(f => fs.statSync(path.join(skillsDir, f)).isDirectory()).sort();
  const names = new Set<string>();

  for (const dir of skills) {
    const skillPath = path.join(skillsDir, dir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const [frontmatter, body] = parseFrontmatter(skillPath);
    for (const key of ['name', 'description']) {
      if (!frontmatter[key]) {
        fail(`${path.relative(ROOT, skillPath)} missing frontmatter key ${key}`);
      }
    }
    const name = frontmatter.name;
    if (!KEBAB_RE.test(name)) {
      fail(`skill name must be kebab-case: ${name}`);
    }
    if (name !== dir) {
      fail(`skill directory must match frontmatter name: ${path.relative(ROOT, skillPath)}`);
    }
    if (!frontmatter.description.startsWith('[OMCS]')) {
      fail(`skill description must start with [OMCS]: ${path.relative(ROOT, skillPath)}`);
    }
    const lowered = body.toLowerCase();
    for (const heading of ['## governance', '## mcp integration points', '## orchestration role']) {
      if (!lowered.includes(heading)) {
        fail(`${path.relative(ROOT, skillPath)} missing required section ${heading}`);
      }
    }
    const mcpSection = getSection(body, '## MCP Integration Points', '## Hooks Dependencies');
    const declaredMcp = mcpToolsFromText(mcpSection);
    const unknownMcp = Array.from(declaredMcp).filter(t => !MCP_TOOL_NAMES.has(t));
    if (unknownMcp.length > 0) {
      fail(`skill ${name} MCP section references unknown tools: ${unknownMcp.sort().join(', ')}`);
    }
    const expectedMcp = EXPECTED_SKILL_MCP_TOOLS[name] || new Set();
    if (expectedMcp.size > 0) {
      const missing = Array.from(expectedMcp).filter(t => !declaredMcp.has(t));
      const extra = Array.from(declaredMcp).filter(t => !expectedMcp.has(t));
      if (missing.length > 0 || extra.length > 0) {
        fail(`skill ${name} MCP tool policy drift: missing ${missing.sort().join(', ')}, extra ${extra.sort().join(', ')}`);
      }
    } else if (!mcpSection.toLowerCase().includes('no direct mcp integration')) {
      fail(`skill ${name} has no governed MCP tools and must state 'No direct MCP integration'`);
    }
    names.add(name);
  }

  const missing = Array.from(EXPECTED_SKILLS).filter(n => !names.has(n));
  const extra = Array.from(names).filter(n => !EXPECTED_SKILLS.has(n));
  if (missing.length > 0) {
    fail(`missing required skills: ${missing.sort().join(', ')}`);
  }
  if (extra.length > 0) {
    fail(`unexpected ungoverned skills: ${extra.sort().join(', ')}`);
  }
  console.log('SKILLS_ARTIFACTS_OK');
}

function parseSetLiterals(filePath: string, varName: string): Set<string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const regex = new RegExp(`export\\s+const\\s+${varName}\\s*=\\s*new\\s+Set\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`, 'm');
  const match = content.match(regex);
  if (!match) {
    fail(`Could not find Set literal for variable ${varName} in ${path.relative(ROOT, filePath)}`);
  }
  const body = match[1];
  const items = body.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  return new Set(items);
}

function validateRouterRegistries(): void {
  const promptRouter = path.join(ROOT, 'hooks', 'prompt-router.ts');
  const subagentBootstrap = path.join(ROOT, 'hooks', 'subagent-bootstrap.ts');
  
  const skillNames = parseSetLiterals(promptRouter, 'SKILL_NAMES');
  const agentNames = parseSetLiterals(promptRouter, 'AGENT_NAMES');
  const knownRoles = parseSetLiterals(subagentBootstrap, 'KNOWN_ROLES');
  const expectedAgents = new Set(Object.keys(EXPECTED_AGENT_READONLY));

  // Check equality
  const diffSkills1 = Array.from(EXPECTED_SKILLS).filter(x => !skillNames.has(x));
  const diffSkills2 = Array.from(skillNames).filter(x => !EXPECTED_SKILLS.has(x));
  if (diffSkills1.length > 0 || diffSkills2.length > 0) {
    fail(`prompt-router SKILL_NAMES drift: expected ${Array.from(EXPECTED_SKILLS).sort().join(', ')}, got ${Array.from(skillNames).sort().join(', ')}`);
  }

  const diffAgents1 = Array.from(expectedAgents).filter(x => !agentNames.has(x));
  const diffAgents2 = Array.from(agentNames).filter(x => !expectedAgents.has(x));
  if (diffAgents1.length > 0 || diffAgents2.length > 0) {
    fail(`prompt-router AGENT_NAMES drift: expected ${Array.from(expectedAgents).sort().join(', ')}, got ${Array.from(agentNames).sort().join(', ')}`);
  }

  const diffRoles1 = Array.from(expectedAgents).filter(x => !knownRoles.has(x));
  const diffRoles2 = Array.from(knownRoles).filter(x => !expectedAgents.has(x));
  if (diffRoles1.length > 0 || diffRoles2.length > 0) {
    fail(`subagent-bootstrap KNOWN_ROLES drift: expected ${Array.from(expectedAgents).sort().join(', ')}, got ${Array.from(knownRoles).sort().join(', ')}`);
  }

  const orchestration = fs.readFileSync(path.join(ROOT, 'docs', 'orchestration.md'), 'utf-8');
  const allExpectedNames = new Set([...expectedAgents, ...EXPECTED_SKILLS]);
  for (const name of allExpectedNames) {
    if (!orchestration.includes(name)) {
      fail(`docs/orchestration.md missing governed registry name: ${name}`);
    }
  }
  console.log('ROUTER_REGISTRY_OK');
}

function validatePluginManifest(): void {
  const manifestPath = path.join(ROOT, '.cursor-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    fail('missing .cursor-plugin/plugin.json');
  }
  const manifest = loadJson(manifestPath);
  const defaults: Record<string, string> = {
    rules: 'rules',
    skills: 'skills',
    agents: 'agents',
    hooks: 'hooks/hooks.json',
  };
  for (const [key, expected] of Object.entries(defaults)) {
    const actual = manifest[key];
    if (actual !== undefined && actual !== expected) {
      fail(`plugin manifest ${key} path (${actual}) must match default (${expected}) or be omitted`);
    }
  }
}

function main(): number {
  validateHooks();
  validateAgents();
  validateSkills();
  validateRouterRegistries();
  validatePluginManifest();
  return 0;
}

process.exit(main());
