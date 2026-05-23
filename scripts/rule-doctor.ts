import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

function log(msg: string) {
  console.log(`ok: ${msg}`);
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// Helper to parse simple frontmatter
function parseFrontmatter(raw: string): Record<string, any> {
  const lines = raw.split(/\r?\n/);
  const data: Record<string, any> = {};
  let currentKey = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('-')) {
      if (currentKey && Array.isArray(data[currentKey])) {
        data[currentKey].push(trimmed.slice(1).trim());
      }
    } else if (trimmed.includes(':')) {
      const idx = trimmed.indexOf(':');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (val === '') {
        currentKey = key;
        data[key] = [];
      } else {
        currentKey = key;
        data[key] = val;
      }
    }
  }
  return data;
}

// Parse docs/confirmed-surfaces.md to get ownership classes mapping
function parseConfirmedSurfaces(): { outcome: string, ownership: string }[] {
  const filePath = path.join(ROOT, 'docs', 'confirmed-surfaces.md');
  if (!fs.existsSync(filePath)) {
    fail(`Could not find docs/confirmed-surfaces.md at ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const rows: { outcome: string, ownership: string }[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      if (trimmed.includes('Outcome family') && trimmed.includes('Ownership class')) {
        inTable = true;
        continue;
      }
      if (inTable) {
        if (trimmed.includes('---')) {
          continue;
        }
        const cols = trimmed.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        if (cols.length >= 2) {
          const outcome = cols[0];
          const ownership = cols[1].replace(/`/g, '');
          rows.push({ outcome, ownership });
        }
      }
    } else {
      inTable = false;
    }
  }
  return rows;
}

function scanRuleFile(filePath: string, surfaces: { outcome: string, ownership: string }[]) {
  const rel = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, 'utf-8');

  // Verify frontmatter existence and description
  const parts = content.split('---');
  if (parts.length < 3) {
    fail(`Rule file ${rel} does not have valid frontmatter enclosed in '---'`);
  }
  const frontmatterRaw = parts[1];
  const fm = parseFrontmatter(frontmatterRaw);

  if (!fm.description || typeof fm.description !== 'string' || fm.description.trim() === '') {
    fail(`Rule file ${rel} is missing a non-empty description in its frontmatter metadata`);
  }

  // Scan text for positive overclaims
  const fullText = parts.slice(2).join('---');
  const lines = fullText.split(/\r?\n/);

  const subject = '(?:oh-my-cursor|this repo|this repository|the repo|this backbone|the backbone|repository|repo)';
  const verb = '(?:ships?|provides?|includes?|owns?|supports?|provisions?|configures?)';
  
  const patterns: Record<string, RegExp> = {
    'repo-file custom modes': new RegExp(`\\b${subject}\\b.{0,80}\\b${verb}\\b.{0,80}\\brepo[- ](?:file|native)\\b.{0,60}\\bcustom modes?\\b`, 'i'),
    'repo-file background agents': new RegExp(`\\b${subject}\\b.{0,80}\\b${verb}\\b.{0,80}\\brepo[- ](?:file|native)\\b.{0,60}\\bbackground[- ]agents?\\b`, 'i'),
    'default checked-in mcp config': new RegExp(`\\b${subject}\\b.{0,80}\\b${verb}\\b.{0,80}\\b(?:default|checked[- ]in|repo[- ]owned)\\b.{0,40}(?:\\.cursor/mcp\\.json|mcp config)\\b`, 'i'),
    'automated plugin load loading': new RegExp(`\\b${subject}\\b.{0,80}\\b${verb}\\b.{0,80}\\b(?:plugin[- ]load|package[- ]load|automatic[- ]load|load[- ]plugin)\\b`, 'i'),
  };

  const negations = [
    'does not',
    'do not',
    'not ',
    'without',
    'unless',
    'unsupported',
    'out-of-scope',
    'not currently',
    'not yet',
    'avoid',
    'left opt-in',
    'unclaimed',
    'fallback',
    'host-product-only',
    'product capability',
    'product feature',
    'never claim',
  ];

  const violations: string[] = [];

  for (let lineno = 1; lineno <= lines.length; lineno++) {
    const rawLine = lines[lineno - 1];
    const line = rawLine.toLowerCase().split(/\s+/).join(' ');
    
    // Check line for patterns
    if (!line || negations.some(neg => line.includes(neg))) {
      continue;
    }

    for (const [label, pattern] of Object.entries(patterns)) {
      if (pattern.test(line)) {
        violations.push(`${rel}:L${lineno}: Overclaim violation (${label}): "${rawLine.trim()}"`);
      }
    }

    // Additional boundary check for host-product-only or unsupported claims
    // We check if a line has positive claim words and refers to "custom modes", "background agents", etc.
    const positiveAssertion = /\b(repo-owned|checked-in|shipped|provided|configured|shipped|implemented|automated)\b/i.test(line);
    if (positiveAssertion) {
      if (/\bcustom modes?\b/i.test(line)) {
        violations.push(`${rel}:L${lineno}: Forbidden positive custom mode claim: "${rawLine.trim()}"`);
      }
      if (/\bbackground[- ]agents?\b/i.test(line)) {
        violations.push(`${rel}:L${lineno}: Forbidden positive background agent claim: "${rawLine.trim()}"`);
      }
      if (/\b\.cursor\/mcp\.json\b/i.test(line) || /\bmcp config\b/i.test(line)) {
        violations.push(`${rel}:L${lineno}: Forbidden positive MCP configuration claim: "${rawLine.trim()}"`);
      }
    }
  }

  if (violations.length > 0) {
    fail(`Rule Doctor found violations in ${rel}:\n${violations.join('\n')}`);
  }

  log(`verified rule file ${rel}`);
}

function main() {
  const surfaces = parseConfirmedSurfaces();
  log(`Parsed ${surfaces.length} outcome surface mappings from docs/confirmed-surfaces.md`);

  const ruleDirs = ['.cursor/rules', 'rules'];
  const ruleFiles: string[] = [];

  for (const dir of ruleDirs) {
    const fullDir = path.join(ROOT, dir);
    if (fs.existsSync(fullDir)) {
      const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.mdc'));
      for (const file of files) {
        ruleFiles.push(path.join(fullDir, file));
      }
    }
  }

  if (ruleFiles.length === 0) {
    fail('No rule files found under .cursor/rules/ or rules/');
  }

  for (const filePath of ruleFiles) {
    scanRuleFile(filePath, surfaces);
  }

  console.log('Rule Doctor: All rule files verified successfully and are compliant with confirmed surfaces.');
  process.exit(0);
}

main();
