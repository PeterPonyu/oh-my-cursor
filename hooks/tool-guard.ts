import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { trace } from './_trace.ts';
import { agentIsReadonly, agentToolsAllowlist, getActiveRole } from './_active_role.ts';
import { extractFilePath, extractToolName } from './_tool_payload.ts';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const NAMING_SLOP_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'slop-final', regex: /-final(\.[^./]+)?$/ },
  { name: 'slop-final-vN', regex: /-final-v\d+(\.[^./]+)?$/ },
  { name: 'slop-backup', regex: /_backup\b/ },
  { name: 'slop-old', regex: /_old\b/ },
  { name: 'slop-copy', regex: /_copy\b/ },
  { name: 'slop-vN', regex: /_v\d+(\.[^./]+)?$/ },
  { name: 'slop-paren', regex: / \(\d+\)(\.[^./]+)?$/ },
  { name: 'slop-space-copy', regex: / copy(\.[^./]+)?$/ },
];

function matchNamingSlop(basename: string): string {
  for (const { name, regex } of NAMING_SLOP_PATTERNS) {
    if (regex.test(basename)) return name;
  }
  return '';
}

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
      user_message: 'Tool-guard input was not JSON; skipped.'
    }));
    return 0;
  }

  const toolName = extractToolName(payload);
  const filePath = extractFilePath(payload);
  const basename = filePath ? path.posix.basename(filePath.replace(/\\/g, '/')) : '';

  const activeRole = getActiveRole();
  const roleReadonly = activeRole ? agentIsReadonly(activeRole) : null;
  const roleTools = activeRole ? agentToolsAllowlist(activeRole) : null;

  let permission = 'allow';
  let message = 'Tool-guard saw no protected file mutation.';
  let status = 'pass';

  if (EDIT_TOOLS.has(toolName) && basename === 'workflow-state.json') {
    permission = 'ask';
    message = (
      'Tool-guard observed a direct edit to a workflow-state.json document. ' +
      'Prefer the cursor-state-bridge tools or `node --experimental-strip-types scripts/workflow-state.ts` ' +
      '(the installed `.cursor/state/workflow-state.ts` path is a compatibility shim) so phase, ' +
      'acceptance criteria, and history advance through one bounded path.'
    );
    status = 'ask';
  } else if (activeRole && roleReadonly === true && EDIT_TOOLS.has(toolName)) {
    permission = 'ask';
    message = (
      `Tool-guard: active subagent role \`${activeRole}\` declares \`readonly: true\` ` +
      `in agents/${activeRole}.md. Edit-class tools require user confirmation. ` +
      'If this edit is intended, approve to proceed; otherwise route the change to a non-readonly role.'
    );
    status = 'ask';
  } else if (activeRole && Array.isArray(roleTools) && toolName && !roleTools.includes(toolName)) {
    permission = 'ask';
    message = (
      `Tool-guard: active subagent role \`${activeRole}\` does not list \`${toolName}\` in its ` +
      `\`tools:\` allowlist (agents/${activeRole}.md). Approve to proceed or extend the allowlist.`
    );
    status = 'ask';
  } else if (EDIT_TOOLS.has(toolName) && basename && matchNamingSlop(basename)) {
    const slopName = matchNamingSlop(basename);
    permission = 'ask';
    status = 'ask';
    message = `Tool-guard observed an edit to \`${basename}\` whose name matches the \`${slopName}\` slop pattern. Prefer overwriting the canonical file instead of creating a slop variant. Approve if this is intentional (one-off backup, migration step).`;
  }

  const output = {
    status,
    fail_open: permission !== 'deny',
    permission,
    user_message: message,
    tool_name: toolName,
    file_path: filePath,
  };

  trace({
    hook: 'tool-guard',
    event: 'preToolUse',
    status,
    permission,
    tool_name: toolName,
    file_basename: basename,
    active_role: activeRole || '',
    naming_slop: matchNamingSlop(basename),
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
