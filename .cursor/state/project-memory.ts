import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';
import { fileLock } from '../../src/oh_my_cursor/workflow_state/locking.ts';

const currentFile = fileURLToPath(import.meta.url);
const DIR = path.dirname(currentFile);
const MEMORY_PATH = path.join(DIR, 'project-memory.json');

export interface TechnologyStack {
  core?: string;
  runtime?: string;
  styling?: string;
  [key: string]: string | undefined;
}

export interface ProjectMemory {
  project_name: string;
  project_directories: string[];
  technology_stack: TechnologyStack;
  key_file_indexes: string[];
  cumulative_context: string;
  last_updated: string;
}

const DEFAULT_MEMORY: ProjectMemory = {
  project_name: 'oh-my-cursor',
  project_directories: [
    '.cursor/rules',
    'agents',
    'hooks',
    'rules',
    'skills',
    'src'
  ],
  technology_stack: {
    core: 'HTML / TypeScript',
    runtime: 'Node.js (node --experimental-strip-types)',
    styling: 'Vanilla CSS'
  },
  key_file_indexes: [
    'AGENTS.md',
    'README.md',
    'docs/confirmed-surfaces.md',
    'hooks/hooks.json'
  ],
  cumulative_context: 'Initial project setup of oh-my-cursor backbone.',
  last_updated: new Date().toISOString()
};

export function readMemory(): ProjectMemory {
  if (!fs.existsSync(MEMORY_PATH)) {
    writeMemory(DEFAULT_MEMORY);
    return DEFAULT_MEMORY;
  }
  try {
    const raw = fs.readFileSync(MEMORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Failed to read project-memory.json: ${err.message}`);
  }
}

export function writeMemory(memory: ProjectMemory): void {
  const dir = path.dirname(MEMORY_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const data = JSON.stringify(memory, null, 2) + '\n';
  fs.writeFileSync(MEMORY_PATH, data, 'utf-8');
}

export function updateMemory(updates: Partial<ProjectMemory> & { technology_stack?: Partial<TechnologyStack> }): ProjectMemory {
  return fileLock(MEMORY_PATH, () => {
    const current = readMemory();
    const updated = {
      ...current,
      ...updates,
      technology_stack: {
        ...current.technology_stack,
        ...updates.technology_stack
      },
      last_updated: new Date().toISOString()
    };
    writeMemory(updated);
    return updated;
  });
}

export function appendContext(text: string): ProjectMemory {
  return fileLock(MEMORY_PATH, () => {
    const current = readMemory();
    const newContext = current.cumulative_context
      ? `${current.cumulative_context.trim()}\n\n${text.trim()}`
      : text.trim();
    const updated = {
      ...current,
      cumulative_context: newContext,
      last_updated: new Date().toISOString()
    };
    writeMemory(updated);
    return updated;
  });
}

function printHelpAndExit(): never {
  console.log(`
Usage:
  node --experimental-strip-types project-memory.ts <command> [options]

Commands:
  get                         Display project memory JSON
  set [options]               Set metadata. Options:
                                --project-name <name>
                                --add-dir <directory>
                                --remove-dir <directory>
                                --core-stack <stack>
                                --runtime-stack <runtime>
                                --styling-stack <styling>
                                --add-index <file>
                                --remove-index <file>
  append <context_text>       Append text to cumulative_context
`);
  process.exit(0);
}

export function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelpAndExit();
  }

  const command = args[0];
  if (!['get', 'set', 'append'].includes(command)) {
    console.error(`Error: Unknown command ${command}`);
    process.exit(1);
  }

  try {
    if (command === 'get') {
      const memory = readMemory();
      console.log(JSON.stringify(memory, null, 2));
    } else if (command === 'append') {
      const text = args.slice(1).join(' ');
      if (!text) {
        console.error('Error: context text to append is required');
        process.exit(1);
      }
      const updated = appendContext(text);
      console.log('ok: appended context to project-memory.json');
    } else if (command === 'set') {
      const parsedOptions: any = {};
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
          const key = arg.slice(2);
          const next = args[i + 1];
          if (next && !next.startsWith('--')) {
            parsedOptions[key] = next;
            i++;
          } else {
            parsedOptions[key] = 'true';
          }
        }
      }

      const updates: any = {};
      if (parsedOptions['project-name']) {
        updates.project_name = parsedOptions['project-name'];
      }

      const current = readMemory();

      if (parsedOptions['add-dir']) {
        const dir = parsedOptions['add-dir'];
        if (!current.project_directories.includes(dir)) {
          updates.project_directories = [...current.project_directories, dir];
        }
      }
      if (parsedOptions['remove-dir']) {
        const dir = parsedOptions['remove-dir'];
        updates.project_directories = current.project_directories.filter(d => d !== dir);
      }

      const stackUpdates: any = {};
      if (parsedOptions['core-stack']) {
        stackUpdates.core = parsedOptions['core-stack'];
      }
      if (parsedOptions['runtime-stack']) {
        stackUpdates.runtime = parsedOptions['runtime-stack'];
      }
      if (parsedOptions['styling-stack']) {
        stackUpdates.styling = parsedOptions['styling-stack'];
      }
      if (Object.keys(stackUpdates).length > 0) {
        updates.technology_stack = stackUpdates;
      }

      if (parsedOptions['add-index']) {
        const idx = parsedOptions['add-index'];
        if (!current.key_file_indexes.includes(idx)) {
          updates.key_file_indexes = [...current.key_file_indexes, idx];
        }
      }
      if (parsedOptions['remove-index']) {
        const idx = parsedOptions['remove-index'];
        updates.key_file_indexes = current.key_file_indexes.filter(i => i !== idx);
      }

      updateMemory(updates);
      console.log('ok: updated project-memory.json');
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile);
if (isDirectRun) {
  main();
}
