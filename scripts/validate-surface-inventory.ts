import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

type Inventory = {
  schemaVersion: number;
  host: string;
  package: string;
  surfaces: {
    skills: { count: number; names: string[] };
    agents: { count: number; names: string[] };
    hooks: { count: number; events: string[] };
    mcpTools: { count: number; names: string[] };
  };
};

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function log(message: string): void {
  console.log(`ok: ${message}`);
}

function readJson<T>(relativePath: string): T {
  const filePath = path.join(ROOT, relativePath);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (err: any) {
    fail(`could not parse ${relativePath}: ${err.message || err}`);
  }
}

function sorted(values: Iterable<string>): string[] {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function assertEqual(label: string, expected: string[], actual: string[]): void {
  const left = sorted(expected);
  const right = sorted(actual);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    const missing = left.filter(value => !right.includes(value));
    const extra = right.filter(value => !left.includes(value));
    fail(`${label} drift: missing [${missing.join(', ')}], extra [${extra.join(', ')}]`);
  }
  log(`${label} matches inventory (${left.length})`);
}

function parseFrontmatterName(filePath: string): string {
  const text = fs.readFileSync(filePath, 'utf-8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    fail(`${path.relative(ROOT, filePath)} missing YAML frontmatter`);
  }
  const nameLine = match[1].split(/\r?\n/).find(line => line.trim().startsWith('name:'));
  if (!nameLine) {
    fail(`${path.relative(ROOT, filePath)} missing frontmatter name`);
  }
  return nameLine!.slice(nameLine!.indexOf(':') + 1).trim().replace(/^["']|["']$/g, '');
}

function actualSkillNames(): string[] {
  const skillsDir = path.join(ROOT, 'skills');
  return sorted(fs.readdirSync(skillsDir)
    .filter(entry => fs.existsSync(path.join(skillsDir, entry, 'SKILL.md')))
    .map(entry => parseFrontmatterName(path.join(skillsDir, entry, 'SKILL.md'))));
}

function actualAgentNames(): string[] {
  const agentsDir = path.join(ROOT, 'agents');
  return sorted(fs.readdirSync(agentsDir)
    .filter(entry => entry.endsWith('.md'))
    .map(entry => parseFrontmatterName(path.join(agentsDir, entry))));
}

function actualHookEvents(): string[] {
  const hooksJson = readJson<{ hooks?: Record<string, unknown> }>('hooks/hooks.json');
  if (!hooksJson.hooks || typeof hooksJson.hooks !== 'object') {
    fail('hooks/hooks.json must contain a hooks object');
  }
  return sorted(Object.keys(hooksJson.hooks));
}

async function actualMcpToolNames(): Promise<string[]> {
  const serverPath = path.join(ROOT, 'mcp', 'cursor-state-bridge', 'server.ts');
  const mod = await import(serverPath);
  if (!Array.isArray(mod.TOOLS)) {
    fail('mcp/cursor-state-bridge/server.ts must export TOOLS array');
  }
  return sorted(mod.TOOLS.map((tool: any) => tool?.name).filter((name: unknown): name is string => typeof name === 'string'));
}

function assertCount(label: string, declared: number, actual: number): void {
  if (declared !== actual) {
    fail(`${label} count drift: inventory declares ${declared}, actual is ${actual}`);
  }
  log(`${label} count is ${actual}`);
}

function validateReadmeCounts(inventory: Inventory): void {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
  const checks: [string, RegExp][] = [
    ['README hooks count', new RegExp(`\\*\\*Hooks\\*\\* \\(${inventory.surfaces.hooks.count} events\\)`, 'i')],
    ['README agents count', new RegExp(`\\*\\*Agents\\*\\* \\(${inventory.surfaces.agents.count} roles\\)`, 'i')],
    ['README skills count', new RegExp(`\\*\\*Skills\\*\\* \\(${inventory.surfaces.skills.count} skills\\)`, 'i')],
    ['README MCP tool count', new RegExp(`\\*\\*MCP bridge\\*\\* \\(${inventory.surfaces.mcpTools.count} tools, opt-in\\)`, 'i')],
  ];
  for (const [label, pattern] of checks) {
    if (!pattern.test(readme)) {
      fail(`${label} is missing or stale`);
    }
    log(label);
  }
}

async function main(): Promise<void> {
  const inventory = readJson<Inventory>('docs/surface-inventory.json');
  if (inventory.schemaVersion !== 1) fail('inventory schemaVersion must be 1');
  if (inventory.host !== 'cursor') fail('inventory host must be cursor');
  if (inventory.package !== 'oh-my-cursor') fail('inventory package must be oh-my-cursor');

  const skills = actualSkillNames();
  const agents = actualAgentNames();
  const hooks = actualHookEvents();
  const mcpTools = await actualMcpToolNames();

  assertEqual('skills', inventory.surfaces.skills.names, skills);
  assertEqual('agents', inventory.surfaces.agents.names, agents);
  assertEqual('hooks', inventory.surfaces.hooks.events, hooks);
  assertEqual('MCP tools', inventory.surfaces.mcpTools.names, mcpTools);

  assertCount('skills', inventory.surfaces.skills.count, skills.length);
  assertCount('agents', inventory.surfaces.agents.count, agents.length);
  assertCount('hooks', inventory.surfaces.hooks.count, hooks.length);
  assertCount('MCP tools', inventory.surfaces.mcpTools.count, mcpTools.length);

  validateReadmeCounts(inventory);
  console.log('SURFACE_INVENTORY_OK');
}

main().catch(err => fail(err?.message || String(err)));
