import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveWorkspaceRoot } from './_repo.ts';
import { trace } from './_trace.ts';

const currentFile = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = resolveWorkspaceRoot(currentFile);

export const SKILL_NAMES = new Set([
  'phase-controller', 'plan', 'auto-execute', 'iterate-loop',
  'parallel-batch', 'review', 'debug', 'trace', 'security-review',
  'deep-interview', 'doctor', 'local-plugin-check', 'verify', 'mcp-setup',
  'team-controller',
]);

export const AGENT_NAMES = new Set([
  'architect',
  'orchestrator', 'researcher', 'planner', 'implementer', 'verifier',
  'critic', 'debugger', 'security-reviewer',
  'explore', 'code-reviewer', 'qa-tester', 'test-engineer', 'tracer',
]);

export const PHASE_NAMES = new Set([
  'intake', 'research', 'plan', 'execute',
  'verify', 'review', 'done', 'blocked',
]);

const PROMPT_FIELDS = ['prompt', 'text', 'userPrompt', 'user_prompt', 'message', 'content'];

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

function extractPrompt(payload: any): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  for (const key of PROMPT_FIELDS) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  const nested = payload.input;
  if (nested && typeof nested === 'object') {
    for (const key of PROMPT_FIELDS) {
      const value = nested[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }
  return '';
}

function matches(promptLower: string, names: Set<string>): string[] {
  const found: string[] = [];
  for (const name of names) {
    const escaped = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, 'i');
    if (regex.test(promptLower)) {
      found.push(name);
    }
  }
  return found.sort();
}

function resolveStatePath(payload: any): string | null {
  const candidates: string[] = [];
  const envPath = process.env.OH_MY_CURSOR_WORKFLOW_STATE;
  if (envPath) {
    candidates.push(envPath);
  }
  const payloadPath = payload?.workflow_state;
  if (typeof payloadPath === 'string') {
    candidates.push(payloadPath);
  }

  for (const raw of candidates) {
    try {
      let candidate = raw;
      if (candidate.startsWith('~')) {
        const homedir = process.env.HOME || '';
        candidate = path.join(homedir, candidate.slice(1));
      }
      if (!path.isAbsolute(candidate)) {
        candidate = path.resolve(WORKSPACE_ROOT, candidate);
      }
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function summarizeState(statePath: string): any {
  try {
    const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    if (!data || typeof data !== 'object') {
      return { loaded: false };
    }
    const pending: string[] = [];
    const failed: string[] = [];
    const criteria = data.acceptance_criteria;
    if (Array.isArray(criteria)) {
      for (const item of criteria) {
        if (!item || typeof item !== 'object') continue;
        const status = String(item.status || '').toLowerCase();
        const label = String(item.id || item.criterion || '').trim();
        if (!label) continue;
        if (status === 'failed') {
          failed.push(label);
        } else if (status !== 'passed' && status !== 'skipped') {
          pending.push(label);
        }
      }
    }
    return {
      loaded: true,
      task_id: data.task_id,
      phase: data.phase,
      status: data.status,
      current_role: data.current_role,
      next_action: data.next_action,
      pending_criteria: pending.slice(0, 10),
      failed_criteria: failed.slice(0, 10),
    };
  } catch {
    return { loaded: false };
  }
}

function main(): number {
  const payload = readPayload();
  if (payload?._invalid_json) {
    console.log(JSON.stringify({
      status: 'pass',
      fail_open: true,
      additional_context: '',
      message: 'Prompt-router input was not JSON; skipped.',
    }));
    return 0;
  }

  const prompt = extractPrompt(payload);
  const promptLower = prompt.toLowerCase();

  const matchedSkills = matches(promptLower, SKILL_NAMES);
  const matchedAgents = matches(promptLower, AGENT_NAMES);
  const matchedPhases = matches(promptLower, PHASE_NAMES);

  const statePath = resolveStatePath(payload);
  const stateSummary = statePath ? summarizeState(statePath) : { loaded: false };

  const parts: string[] = [];
  if (matchedSkills.length > 0) {
    parts.push(`Skill keywords detected: ${matchedSkills.join(', ')}. Matching SKILL.md files live under skills/.`);
  }
  if (matchedAgents.length > 0) {
    parts.push(`Agent keywords detected: ${matchedAgents.join(', ')}. Matching role prompts live under agents/.`);
  }
  if (matchedPhases.length > 0) {
    parts.push(`Phase keywords detected: ${matchedPhases.join(', ')}. phase-controller routes phase transitions; see skills/phase-controller/SKILL.md.`);
  }
  if (stateSummary.loaded) {
    parts.push(
      `Active workflow state: phase=${stateSummary.phase || '?'}, status=${stateSummary.status || '?'}` +
      (stateSummary.current_role ? `, role=${stateSummary.current_role}` : '') + '.'
    );
    if (stateSummary.failed_criteria && stateSummary.failed_criteria.length > 0) {
      parts.push(`Failed acceptance criteria: ${stateSummary.failed_criteria.join(', ')}.`);
    }
    if (stateSummary.pending_criteria && stateSummary.pending_criteria.length > 0) {
      parts.push(`Pending acceptance criteria: ${stateSummary.pending_criteria.join(', ')}.`);
    }
    if (stateSummary.next_action) {
      parts.push(`Recorded next action: ${stateSummary.next_action}.`);
    }
  }

  const additionalContext = parts.join(' ');
  const output = {
    status: 'pass',
    fail_open: true,
    additional_context: additionalContext,
    matched_skills: matchedSkills,
    matched_agents: matchedAgents,
    matched_phases: matchedPhases,
    workflow_state: {
      path: statePath,
      loaded: stateSummary.loaded,
      phase: stateSummary.phase || null,
      status: stateSummary.status || null,
      current_role: stateSummary.current_role || null,
      pending_criteria: stateSummary.pending_criteria || [],
      failed_criteria: stateSummary.failed_criteria || [],
    },
  };

  trace({
    hook: 'prompt-router',
    event: 'beforeSubmitPrompt',
    status: output.status,
    prompt_length: prompt.length,
    matched_skills: matchedSkills,
    matched_agents: matchedAgents,
    matched_phases: matchedPhases,
    state_loaded: stateSummary.loaded,
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
