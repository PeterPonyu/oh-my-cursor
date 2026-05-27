// node:test port of test_skills_governance.py.
//
// Asserts that every new memory/rules-authoring skill carries the
// standard governance, MCP, hooks, and orchestration blocks the repo
// requires. Reference skill is skills/phase-controller/SKILL.md (and
// sibling skills/iterate-loop/SKILL.md). The five new skills (remember,
// notepad, wiki, decisions, rules-authoring) must follow the same shape.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..', '..');
const SKILLS = path.join(ROOT, 'skills');

const NEW_SKILLS = [
  'remember',
  'notepad',
  'wiki',
  'decisions',
  'rules-authoring',
] as const;

const REQUIRED_SECTIONS = [
  '## Governance',
  '### Ownership Class',
  '### Proof Class',
  '### Claim Summary',
  '## MCP Integration Points',
  '## Hooks Dependencies',
  '## Orchestration Role',
];

function skillPath(name: string): string {
  return path.join(SKILLS, name, 'SKILL.md');
}

function relativeToRoot(p: string): string {
  return path.relative(ROOT, p);
}

for (const skillName of NEW_SKILLS) {
  test(`${skillName}: skill SKILL.md exists`, () => {
    const p = skillPath(skillName);
    assert.ok(
      fs.existsSync(p) && fs.statSync(p).isFile(),
      `${relativeToRoot(p)} missing`,
    );
  });

  test(`${skillName}: frontmatter has name and description`, () => {
    const p = skillPath(skillName);
    const text = fs.readFileSync(p, 'utf-8');
    const fileName = path.basename(p);
    assert.ok(text.startsWith('---\n'), `${fileName} must start with --- frontmatter`);
    const end = text.indexOf('\n---\n', 4);
    assert.ok(end > 0, `${fileName} frontmatter close marker missing`);
    const fm = text.slice(4, end);
    assert.ok(
      fm.includes(`name: ${skillName}`),
      `${fileName} frontmatter missing name: ${skillName}`,
    );
    assert.ok(fm.includes('description:'), `${fileName} frontmatter missing description`);
    const descLine = fm.split(/\r?\n/).find(line => line.startsWith('description:')) || '';
    assert.ok(descLine.includes('[OMCS]'), `${fileName} description must include [OMCS]`);
  });

  test(`${skillName}: required sections are present`, () => {
    const p = skillPath(skillName);
    const text = fs.readFileSync(p, 'utf-8');
    const missing = REQUIRED_SECTIONS.filter(section => !text.includes(section));
    assert.deepEqual(
      missing,
      [],
      `${path.basename(p)} missing required sections: ${JSON.stringify(missing)}`,
    );
  });

  test(`${skillName}: governance classes are explicit`, () => {
    // Ownership Class and Proof Class blocks must mention the three
    // standard tags so readers can tell at a glance which apply.
    const p = skillPath(skillName);
    const text = fs.readFileSync(p, 'utf-8');
    const fileName = path.basename(p);
    assert.ok(text.includes('**repo-owned**'), `${fileName} Ownership Class missing repo-owned tag`);
    assert.ok(
      text.includes('**host-product-only**'),
      `${fileName} Ownership Class missing host-product-only tag`,
    );
    assert.ok(
      text.includes('**unsupported-or-out-of-scope**'),
      `${fileName} Ownership Class missing unsupported-or-out-of-scope tag`,
    );
    assert.ok(text.includes('**official-doc**'), `${fileName} Proof Class missing official-doc tag`);
    assert.ok(
      text.includes('**checked-in-artifact**'),
      `${fileName} Proof Class missing checked-in-artifact tag`,
    );
    assert.ok(
      text.includes('**runtime-smoke**'),
      `${fileName} Proof Class missing runtime-smoke tag`,
    );
  });
}
