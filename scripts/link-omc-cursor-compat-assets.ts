import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import * as os from 'node:os';

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function parseFrontmatter(text: string): { fields: Record<string, string>; body: string } {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { fields: {}, body: text };
  }
  const match = text.match(/^---(?:\r?\n)([\s\S]*?)(?:\r?\n)---(?:\r?\n|$)/);
  if (!match) {
    return { fields: {}, body: text };
  }
  const fmText = match[1];
  const body = text.slice(match[0].length);
  const fields: Record<string, string> = {};
  for (const raw of fmText.split(/\r?\n/)) {
    const idx = raw.indexOf(':');
    if (idx === -1) continue;
    const key = raw.slice(0, idx).trim();
    const val = raw.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    fields[key] = val;
  }
  return { fields, body };
}

function renderFrontmatter(fields: Record<string, string>, body: string): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    let val = value;
    if (/[:#\[\]{}]/.test(val)) {
      val = '"' + val.replace(/"/g, '\\"') + '"';
    }
    lines.push(`${key}: ${val}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n' + body;
}

function latestOmcCache(home: string): string {
  const root = path.join(home, '.claude', 'plugins', 'cache', 'omc', 'oh-my-claudecode');
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    fail(`OMC cache not found at ${root}`);
  }
  const versionKey = (name: string): number[] => {
    return name.split(/[.-]/).map(item => {
      const num = parseInt(item, 10);
      return isNaN(num) ? 0 : num;
    });
  };
  const versions = fs.readdirSync(root).filter(f => fs.statSync(path.join(root, f)).isDirectory());
  if (versions.length === 0) {
    fail(`OMC cache has no version directories under ${root}`);
  }
  versions.sort((a, b) => {
    const keyA = versionKey(a);
    const keyB = versionKey(b);
    const len = Math.max(keyA.length, keyB.length);
    for (let i = 0; i < len; i++) {
      const valA = keyA[i] || 0;
      const valB = keyB[i] || 0;
      if (valA !== valB) {
        return valA - valB;
      }
    }
    return 0;
  });
  return path.join(root, versions[versions.length - 1]);
}

function ensureCleanTarget(targetPath: string, force: boolean): void {
  let exists = false;
  try {
    fs.lstatSync(targetPath);
    exists = true;
  } catch {}
  if (exists) {
    if (!force) {
      fail(`target already exists: ${targetPath} (rerun with --force)`);
    }
    try {
      const stat = fs.lstatSync(targetPath);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }
    } catch (err: any) {
      fail(`failed to remove existing target ${targetPath}: ${err.message}`);
    }
  }
}

function normalizeName(raw: string, fallback: string): string {
  let name = raw || fallback;
  if (!name.startsWith('omc-')) {
    name = `omc-${name}`;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    fail(`unsafe OMC asset name: ${JSON.stringify(name)}`);
  }
  return name;
}

function childTarget(root: string, name: string): string {
  const rootResolved = path.resolve(root);
  const target = path.resolve(root, name);
  const relative = path.relative(rootResolved, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`target escapes compatibility root: ${target}`);
  }
  return target;
}

// Provenance prefix, intentional: materialized copies keep the source `[OMC]`
// tag (NOT this port's `[OMCS]`) because they are foreign oh-my-claudecode
// assets surfaced unchanged — labeling them `[OMCS]` would falsely claim them as
// Cursor-port-owned content. Likewise the write target is `~/.claude/skills` and
// `~/.claude/agents` (not `.cursor/`-scoped) on purpose: those are Cursor's
// officially-documented Claude-compatibility discovery dirs, so this is
// cross-tool interop, not brand leakage. The OMC plugin cache is never mutated.
function copySkill(source: string, targetRoot: string, force: boolean): string {
  const skillMdPath = path.join(source, 'SKILL.md');
  const text = fs.readFileSync(skillMdPath, 'utf-8');
  const { fields, body } = parseFrontmatter(text);
  const name = normalizeName(fields['name'] || '', path.basename(source));
  fields['name'] = name;
  const description = fields['description'] || `OMC skill ${path.basename(source)}`;
  if (!description.startsWith('[OMC]')) {
    fields['description'] = `[OMC] ${description}`;
  }
  const target = childTarget(targetRoot, name);
  ensureCleanTarget(target, force);
  fs.cpSync(source, target, { recursive: true, dereference: false });
  fs.writeFileSync(path.join(target, 'SKILL.md'), renderFrontmatter(fields, body), 'utf-8');
  return name;
}

function copyAgent(source: string, targetRoot: string, force: boolean): string {
  const text = fs.readFileSync(source, 'utf-8');
  const { fields, body } = parseFrontmatter(text);
  const stem = path.basename(source, '.md');
  const name = normalizeName(fields['name'] || '', stem);
  fields['name'] = name;
  const description = fields['description'] || `OMC agent ${stem}`;
  if (!description.startsWith('[OMC]')) {
    fields['description'] = `[OMC] ${description}`;
  }
  if (fields['model'] && fields['model'] !== 'inherit' && fields['model'] !== 'auto') {
    fields['model'] = 'inherit';
  }
  const target = childTarget(targetRoot, `${name}.md`);
  ensureCleanTarget(target, force);
  fs.cpSync(source, target, { dereference: false });
  fs.writeFileSync(target, renderFrontmatter(fields, body), 'utf-8');
  return name;
}

function getSkillTargets(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (f === 'SKILL.md') {
        results.push(path.dirname(full));
      }
    }
  }
  walk(dir);
  return results.sort();
}

function getAgentTargets(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(f => path.join(dir, f))
    .filter(f => fs.statSync(f).isFile() && f.endsWith('.md'))
    .sort();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let homeDir = os.homedir();
  let sourceDir: string | null = null;
  let force = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--home') {
      homeDir = args[++i];
    } else if (arg === '--source') {
      sourceDir = args[++i];
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--home=')) {
      homeDir = arg.slice(7);
    } else if (arg.startsWith('--source=')) {
      sourceDir = arg.slice(9);
    } else if (arg === '-h' || arg === '--help') {
      console.log('Usage: node --experimental-strip-types scripts/link-omc-cursor-compat-assets.ts [options]');
      console.log('Options:');
      console.log('  --home <path>    Home directory path (default: os.homedir())');
      console.log('  --source <path>  OMC cache version root (default: auto-detected)');
      console.log('  --force          Overwrite existing files/directories');
      console.log('  --dry-run        Print actions without executing them');
      process.exit(0);
    }
  }
  return { homeDir, sourceDir, force, dryRun };
}

function expandUser(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

function main() {
  const { homeDir, sourceDir, force, dryRun } = parseArgs();
  const home = path.resolve(expandUser(homeDir));
  const source = sourceDir ? path.resolve(expandUser(sourceDir)) : latestOmcCache(home);

  const skillsSource = path.join(source, 'skills');
  const agentsSource = path.join(source, 'agents');

  if (!fs.existsSync(skillsSource) || !fs.statSync(skillsSource).isDirectory()) {
    fail(`OMC skills source missing: ${skillsSource}`);
  }
  if (!fs.existsSync(agentsSource) || !fs.statSync(agentsSource).isDirectory()) {
    fail(`OMC agents source missing: ${agentsSource}`);
  }

  const skillTargets = getSkillTargets(skillsSource);
  const agentTargets = getAgentTargets(agentsSource);

  if (skillTargets.length === 0) {
    fail(`no OMC skills found under ${skillsSource}`);
  }
  if (agentTargets.length === 0) {
    fail(`no OMC agents found under ${agentsSource}`);
  }

  const userSkills = path.join(home, '.claude', 'skills');
  const userAgents = path.join(home, '.claude', 'agents');

  if (dryRun) {
    console.log(`would source OMC assets from ${source}`);
    console.log(`would write ${skillTargets.length} skills to ${userSkills}`);
    console.log(`would write ${agentTargets.length} agents to ${userAgents}`);
    process.exit(0);
  }

  fs.mkdirSync(userSkills, { recursive: true });
  fs.mkdirSync(userAgents, { recursive: true });

  const skills = skillTargets.map(p => copySkill(p, userSkills, force));
  const agents = agentTargets.map(p => copyAgent(p, userAgents, force));

  console.log(`ok: linked ${skills.length} OMC skills into ${userSkills}`);
  console.log(`ok: linked ${agents.length} OMC agents into ${userAgents}`);
  console.log(`ok: OMC source remained read-only at ${source}`);
  process.exit(0);
}

main();
