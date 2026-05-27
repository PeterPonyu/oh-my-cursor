import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveRepoRoot } from './_repo.ts';
import { trace } from './_trace.ts';
import { setActiveRole } from './_active_role.ts';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = resolveRepoRoot(currentFile);
const AGENTS_DIR = path.join(ROOT, 'agents');
const SUBAGENT_RUNS_PATH = path.join(ROOT, '.cursor', 'state', 'subagent-runs.json');
const SUBAGENT_RUNS_CAP = 20;

export const KNOWN_ROLES = new Set([
  'architect',
  'code-reviewer',
  'critic',
  'debugger',
  'explore',
  'implementer',
  'orchestrator',
  'planner',
  'qa-tester',
  'researcher',
  'security-reviewer',
  'test-engineer',
  'tracer',
  'verifier',
]);

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

function main(): number {
  const payload = readPayload();
  if (payload?._invalid_json) {
    console.log(JSON.stringify({
      status: 'pass',
      fail_open: true,
      permission: 'allow',
      user_message: 'Subagent-bootstrap input was not JSON; skipped.'
    }));
    return 0;
  }

  let subagentType = '';
  for (const key of ['subagent_type', 'subagentType', 'type']) {
    const value = payload?.[key];
    if (typeof value === 'string' && value) {
      subagentType = value.toLowerCase();
      break;
    }
  }

  const roleMatch = KNOWN_ROLES.has(subagentType);
  const rolePromptPath = roleMatch ? path.join(AGENTS_DIR, `${subagentType}.md`) : null;
  const rolePromptExists = !!(rolePromptPath && fs.existsSync(rolePromptPath) && fs.statSync(rolePromptPath).isFile());

  let userMessage = '';
  let status = 'pass';

  let subagentId = '';
  for (const key of ['subagent_id', 'subagentId', 'session_id', 'sessionId']) {
    const value = payload?.[key];
    if (typeof value === 'string' && value) {
      subagentId = value;
      break;
    }
  }

  const startTs = Date.now();

  if (roleMatch && rolePromptExists) {
    try {
      setActiveRole(subagentType, subagentId);
    } catch {
      // ignore
    }
    userMessage = `Subagent-bootstrap: matched role \`${subagentType}\`. Use the checked-in prompt at agents/${subagentType}.md`;
    if (subagentType !== 'implementer' && subagentType !== 'debugger') {
      userMessage += ' and stay within its readonly contract.';
    } else {
      userMessage += '.';
    }
    status = 'matched';
  } else {
    userMessage = (
      'Subagent-bootstrap: no matching repo-owned role prompt for ' +
      (subagentType ? `\`${subagentType}\`` : 'this subagent') +
      '. Free-form subagent runs are allowed; check agents/ for a closer match.'
    );
    status = 'pass';
  }

  const relativePromptPath = rolePromptPath ? path.relative(ROOT, rolePromptPath) : null;
  const output = {
    status,
    fail_open: true,
    permission: 'allow',
    user_message: userMessage,
    subagent_type: subagentType,
    role_prompt: relativePromptPath,
  };

  try {
    fs.mkdirSync(path.dirname(SUBAGENT_RUNS_PATH), { recursive: true });
    let runs: any[] = [];
    if (fs.existsSync(SUBAGENT_RUNS_PATH)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(SUBAGENT_RUNS_PATH, 'utf-8'));
        if (Array.isArray(parsed)) runs = parsed;
      } catch {
        runs = [];
      }
    }
    runs.push({ role: subagentType, start_ts: startTs, subagent_id: subagentId || subagentType });
    if (runs.length > SUBAGENT_RUNS_CAP) {
      runs = runs.slice(runs.length - SUBAGENT_RUNS_CAP);
    }
    fs.writeFileSync(SUBAGENT_RUNS_PATH, JSON.stringify(runs, null, 2));
  } catch {
    // fail-open
  }

  trace({
    hook: 'subagent-bootstrap',
    event: 'subagentStart',
    status,
    subagent_type: subagentType,
    role_match: roleMatch,
    role_prompt_exists: rolePromptExists,
    subagent_start_ts: startTs,
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
