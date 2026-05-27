import * as fs from 'node:fs';
import * as process from 'node:process';
import { trace } from './_trace.ts';

const COMMAND_FIELDS = ['command', 'commandLine', 'command_line', 'shell', 'cmd', 'input'];

const WARNING_PATTERNS: Record<string, RegExp> = {
  'force-push': /git\s+push\b[^|;&]*--force(?:-with-lease)?\b/i,
  'skip-hooks': /--no-verify\b/i,
  'skip-gpg-sign': /--no-gpg-sign\b/i,
  'rm-rf-broad': /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b/i,
  'git-reset-hard': /git\s+reset\s+--hard\b/i,
  'git-clean-force': /git\s+clean\b[^|;&]*-[A-Za-z]*f[A-Za-z]*\b/i,
  'checkout-discard': /git\s+checkout\s+--\s+\./i,
  'branch-delete-force': /git\s+branch\b[^|;&]*-D\b/i,
};

const SEVERE_PATTERNS: Record<string, RegExp> = {
  'destroy-state-file': /(?:rm|truncate|sed|awk|tee)\b[^|;&]*\.cursor\/state\/workflow-state(?:\.schema|\.example)?\.json\b/i,
  'redirect-overwrite-state-file': />\s*\"?\.cursor\/state\/workflow-state(?:\.schema|\.example)?\.json\b/i,
  'destroy-local-plugin-install': /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b[^|;&]*~?\/?\.cursor\/plugins\/local\/oh-my-cursor\b/i,
  'destroy-local-plugin-root': /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b[^|;&]*~?\/?\.cursor\/plugins\/local\/?\s*$/i,
};

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

function extractCommand(payload: any): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  for (const key of COMMAND_FIELDS) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  for (const nestedKey of ['tool', 'arguments', 'tool_call', 'toolCall']) {
    const nested = payload[nestedKey];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      for (const key of COMMAND_FIELDS) {
        const value = nested[key];
        if (typeof value === 'string' && value.trim()) {
          return value;
        }
      }
    }
  }
  return '';
}

function scan(command: string, patterns: Record<string, RegExp>): string[] {
  const matched: string[] = [];
  for (const [label, regex] of Object.entries(patterns)) {
    if (regex.test(command)) {
      matched.push(label);
    }
  }
  return matched;
}

function main(): number {
  const payload = readPayload();
  if (payload?._invalid_json) {
    console.log(JSON.stringify({
      status: 'pass',
      fail_open: true,
      permission: 'allow',
      user_facing_message: 'Shell-guard input was not JSON; skipped.',
    }));
    return 0;
  }

  const command = extractCommand(payload);
  const warnings = scan(command, WARNING_PATTERNS);
  const severe = scan(command, SEVERE_PATTERNS);

  let permission = 'allow';
  let message = 'Shell-guard saw no risky patterns.';
  let status = 'pass';

  if (severe.length > 0) {
    permission = 'ask';
    message = (
      'Shell-guard flagged a severe pattern that would corrupt repo-owned state or the local plugin install: ' +
      severe.join(', ') +
      '. Use scripts/workflow-state.py for state edits and scripts/install-local-plugin.ts for the local plugin path.'
    );
    status = 'severe';
  } else if (warnings.length > 0) {
    permission = 'allow';
    message = (
      'Shell-guard noticed risky patterns: ' +
      warnings.join(', ') +
      '. Confirm the command is intentional before continuing.'
    );
    status = 'warning';
  }

  const output = {
    status,
    fail_open: severe.length === 0,
    permission,
    user_facing_message: message,
    command_excerpt: command.slice(0, 200),
    warnings,
    severe,
  };

  trace({
    hook: 'shell-guard',
    event: 'beforeShellExecution',
    status,
    permission,
    command_excerpt: command.slice(0, 120),
    warnings,
    severe,
  });

  console.log(JSON.stringify(output));
  return 0;
}

process.exit(main());
