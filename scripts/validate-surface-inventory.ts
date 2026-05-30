import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

type Classification = 'default' | 'advanced' | 'internal' | 'deprecated';
type Kind = 'skill' | 'agent' | 'hook' | 'mcp_tool';

type Surface = {
  name: string;
  kind: Kind;
  classification: Classification;
  path: string;
  first_run: boolean;
  rationale: string;
  validator: string;
};

type Inventory = {
  schemaVersion: number;
  host: string;
  package: string;
  surfaces: Surface[];
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
    const missing = left.filter((value) => !right.includes(value));
    const extra = right.filter((value) => !left.includes(value));
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
  const nameLine = match[1].split(/\r?\n/).find((line) => line.trim().startsWith('name:'));
  if (!nameLine) {
    fail(`${path.relative(ROOT, filePath)} missing frontmatter name`);
  }
  return nameLine.slice(nameLine.indexOf(':') + 1).trim().replace(/^["']|["']$/g, '');
}

function actualSkillNames(): string[] {
  const skillsDir = path.join(ROOT, 'skills');
  return sorted(
    fs.readdirSync(skillsDir)
      .filter((entry) => fs.existsSync(path.join(skillsDir, entry, 'SKILL.md')))
      .map((entry) => parseFrontmatterName(path.join(skillsDir, entry, 'SKILL.md'))),
  );
}

function actualAgentNames(): string[] {
  const agentsDir = path.join(ROOT, 'agents');
  return sorted(
    fs.readdirSync(agentsDir)
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => parseFrontmatterName(path.join(agentsDir, entry))),
  );
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

function validateReadmeCounts(counts: Record<Kind, number>): void {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
  const checks: [string, RegExp][] = [
    ['README hooks count', new RegExp(String.raw`\*\*Hooks\*\* \(${counts.hook} events\)`, 'i')],
    ['README agents count', new RegExp(String.raw`\*\*Agents\*\* \(${counts.agent} roles\)`, 'i')],
    ['README skills count', new RegExp(String.raw`\*\*Skills\*\* \(${counts.skill} skills\)`, 'i')],
    ['README MCP tool count', new RegExp(String.raw`\*\*MCP bridge\*\* \(${counts.mcp_tool} tools, opt-in\)`, 'i')],
  ];
  for (const [label, pattern] of checks) {
    if (!pattern.test(readme)) {
      fail(`${label} is missing or stale`);
    }
    log(label);
  }
}

function validateEntries(entries: Surface[], actualNames: Record<Kind, string[]>): Record<Kind, number> {
  const byKind: Record<Kind, Surface[]> = { skill: [], agent: [], hook: [], mcp_tool: [] };
  const counts: Record<Kind, number> = { skill: 0, agent: 0, hook: 0, mcp_tool: 0 };
  const seen = new Set<string>();
  const requiredValidator = 'node --experimental-strip-types scripts/validate-surface-inventory.ts';
  const allowedClassifications = new Set<Classification>(['default', 'advanced', 'internal', 'deprecated']);
  const allowedKinds = new Set<Kind>(['skill', 'agent', 'hook', 'mcp_tool']);

  for (const entry of entries) {
    if (!allowedKinds.has(entry.kind)) fail(`unknown kind ${String((entry as any).kind)} on ${entry.name}`);
    if (!allowedClassifications.has(entry.classification)) fail(`unknown classification ${String((entry as any).classification)} on ${entry.name}`);
    if (typeof entry.name !== 'string' || !entry.name) fail('inventory entry missing name');
    if (typeof entry.path !== 'string' || !entry.path) fail(`inventory entry ${entry.name} missing path`);
    if (typeof entry.rationale !== 'string' || !entry.rationale.trim()) fail(`inventory entry ${entry.name} missing rationale`);
    if (typeof entry.validator !== 'string' || entry.validator !== requiredValidator) fail(`inventory entry ${entry.name} has stale validator`);
    if (typeof entry.first_run !== 'boolean') fail(`inventory entry ${entry.name} first_run must be boolean`);
    if (entry.classification === 'default' && entry.first_run !== true) fail(`default entry ${entry.name} must set first_run true`);
    if (entry.classification !== 'default' && entry.first_run !== false) fail(`non-default entry ${entry.name} must set first_run false`);

    const key = `${entry.kind}:${entry.name}`;
    if (seen.has(key)) fail(`duplicate inventory entry ${key}`);
    seen.add(key);
    byKind[entry.kind].push(entry);
    counts[entry.kind] += 1;

    const expectedPath = entry.kind === 'skill'
      ? `skills/${entry.name}/SKILL.md`
      : entry.kind === 'agent'
        ? `agents/${entry.name}.md`
        : entry.kind === 'hook'
          ? `hooks/hooks.json#${entry.name}`
          : `mcp/cursor-state-bridge/server.ts#TOOLS.${entry.name}`;
    if (entry.path !== expectedPath) {
      fail(`inventory entry ${key} path mismatch: expected ${expectedPath}, observed ${entry.path}`);
    }
  }

  for (const kind of Object.keys(actualNames) as Kind[]) {
    assertEqual(kind, actualNames[kind], byKind[kind].map((entry) => entry.name));
  }

  const defaultSkillCount = byKind.skill.filter((entry) => entry.classification === 'default').length;
  const defaultAgentCount = byKind.agent.filter((entry) => entry.classification === 'default').length;
  if (defaultSkillCount > 5) fail(`default skill ceiling exceeded: ${defaultSkillCount} > 5`);
  if (defaultAgentCount > 6) fail(`default agent ceiling exceeded: ${defaultAgentCount} > 6`);
  log(`default skill ceiling is ${defaultSkillCount}/5`);
  log(`default agent ceiling is ${defaultAgentCount}/6`);

  return counts;
}

async function main(): Promise<void> {
  const inventory = readJson<Inventory>('docs/surface-inventory.json');
  if (inventory.schemaVersion !== 2) fail('inventory schemaVersion must be 2');
  if (inventory.host !== 'cursor') fail('inventory host must be cursor');
  if (inventory.package !== 'oh-my-cursor') fail('inventory package must be oh-my-cursor');
  if (!Array.isArray(inventory.surfaces)) fail('inventory surfaces must be an array');

  const actual = {
    skill: actualSkillNames(),
    agent: actualAgentNames(),
    hook: actualHookEvents(),
    mcp_tool: await actualMcpToolNames(),
  } as Record<Kind, string[]>;

  const counts = validateEntries(inventory.surfaces, actual);
  validateReadmeCounts(counts);
  console.log('SURFACE_INVENTORY_OK');
}

main().catch((err) => fail(err?.message || String(err)));
