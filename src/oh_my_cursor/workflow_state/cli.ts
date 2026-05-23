import * as process from 'node:process';
import {
  DEFAULT_HISTORY_CAP,
  initState,
  setState,
  updateAcceptanceCriterion,
  recordFailure,
  appendHistory,
} from './api.ts';

function printHelpAndExit(): never {
  console.log(`
Usage:
  node --experimental-strip-types cli.ts <command> <path> [options]

Commands:
  init <path> --task-id <id> [--title <title>] [--phase <phase>] [--status <status>] [--role <role>] [--next-action <action>] [--history-cap <cap>]
  set <path> [--phase <phase>] [--status <status>] [--role <role>] [--next-action <action>] [--note <note>] [--history-cap <cap>]
  ac <path> --id <id> [--criterion <criterion>] [--status <status>] [--evidence <evidence>] [--note <note>] [--history-cap <cap>]
  fail <path> [--type <type>] [--message <message>] [--retry-count <count>] [--note <note>] [--history-cap <cap>]
  history <path> --note <note> [--phase <phase>] [--status <status>] [--history-cap <cap>]
`);
  process.exit(0);
}

export function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelpAndExit();
  }

  const command = args[0];
  if (!['init', 'set', 'ac', 'fail', 'history'].includes(command)) {
    console.error(`Error: Unknown command ${command}`);
    process.exit(1);
  }

  const targetPath = args[1];
  if (!targetPath) {
    console.error('Error: Path is required as the second argument');
    process.exit(1);
  }

  // Simple parsing of --name value or --name=value options
  const parsedOptions: any = {};
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      let key = '';
      let value = '';
      if (arg.includes('=')) {
        const parts = arg.split('=');
        key = parts[0].slice(2);
        value = parts.slice(1).join('=');
      } else {
        key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          value = next;
          i++;
        } else {
          value = 'true';
        }
      }
      // Normalize option names to match API properties (e.g. task-id -> task_id or taskId)
      // We will normalize dashes to underscores
      const normKey = key.replace(/-/g, '_');
      parsedOptions[normKey] = value;
    }
  }

  const history_cap = parsedOptions.history_cap !== undefined ? parseInt(parsedOptions.history_cap, 10) : undefined;

  try {
    switch (command) {
      case 'init': {
        if (!parsedOptions.task_id) {
          console.error('Error: --task-id is required for init');
          process.exit(1);
        }
        initState(targetPath, {
          task_id: parsedOptions.task_id,
          title: parsedOptions.title,
          phase: parsedOptions.phase,
          status: parsedOptions.status,
          role: parsedOptions.role,
          next_action: parsedOptions.next_action,
          history_cap,
        });
        break;
      }
      case 'set': {
        setState(targetPath, {
          phase: parsedOptions.phase,
          status: parsedOptions.status,
          role: parsedOptions.role,
          next_action: parsedOptions.next_action,
          note: parsedOptions.note,
          history_cap,
        });
        break;
      }
      case 'ac': {
        if (!parsedOptions.id) {
          console.error('Error: --id is required for ac');
          process.exit(1);
        }
        updateAcceptanceCriterion(targetPath, {
          ac_id: parsedOptions.id,
          status: parsedOptions.status || 'pending',
          criterion: parsedOptions.criterion,
          evidence: parsedOptions.evidence,
          note: parsedOptions.note,
          history_cap,
        });
        break;
      }
      case 'fail': {
        const retry_count = parsedOptions.retry_count !== undefined ? parseInt(parsedOptions.retry_count, 10) : undefined;
        recordFailure(targetPath, {
          type: parsedOptions.type,
          message: parsedOptions.message,
          retry_count,
          note: parsedOptions.note,
          history_cap,
        });
        break;
      }
      case 'history': {
        if (!parsedOptions.note) {
          console.error('Error: --note is required for history');
          process.exit(1);
        }
        appendHistory(targetPath, {
          note: parsedOptions.note,
          phase: parsedOptions.phase,
          status: parsedOptions.status,
          history_cap,
        });
        break;
      }
    }
    console.log(`ok: wrote workflow state: ${targetPath}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
