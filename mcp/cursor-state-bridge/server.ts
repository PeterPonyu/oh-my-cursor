import * as readline from 'node:readline';
import * as process from 'node:process';
import * as path from 'node:path';
import { JailError } from './jail.ts';
import * as stateIo from './state_io.ts';
import * as memoryIo from './memory_io.ts';
import * as traceModule from './_trace.ts';
import * as authModule from './auth.ts';

export const TOOLS: any[] = [
  {
    name: 'state_read',
    description:
      'Read the current workflow state. If task_id is provided, reads ' +
      '<workspace>/docs/plans/<task_id>/workflow-state.json; otherwise reads ' +
      '<workspace>/.cursor/state/workflow-state.json.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Optional task identifier; selects per-task state file.',
        },
        workspace: {
          type: 'string',
          description: 'Optional workspace path override; defaults to startup --workspace arg.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'state_init',
    description: 'Initialise a new workflow-state file for the given task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        plan_id: { type: 'string' },
        title: { type: 'string' },
        phase: { type: 'string' },
        status: { type: 'string' },
        role: { type: 'string' },
        next_action: { type: 'string' },
        scope_per_task: { type: 'boolean' },
        history_cap: { type: 'integer' },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'state_set_phase',
    description: 'Advance the workflow phase for a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        phase: { type: 'string' },
        status: { type: 'string' },
        role: { type: 'string' },
        next_action: { type: 'string' },
        note: { type: 'string' },
        history_cap: { type: 'integer' },
      },
      required: ['task_id', 'phase'],
      additionalProperties: false,
    },
  },
  {
    name: 'state_record_failure',
    description: 'Record a failure event for a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        message: { type: 'string' },
        type: { type: 'string' },
        note: { type: 'string' },
        retry_count: { type: 'integer' },
        history_cap: { type: 'integer' },
      },
      required: ['task_id', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'state_update_acceptance_criterion',
    description: 'Update a single acceptance criterion for a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        ac_id: { type: 'string' },
        status: { type: 'string' },
        criterion: {
          type: 'string',
          description: 'Optional human-readable criterion text; sets or refreshes the AC body.',
        },
        evidence: {
          type: 'string',
          description: 'Optional reference to a checked-in artifact or script output.',
        },
        note: { type: 'string' },
        history_cap: { type: 'integer' },
      },
      required: ['task_id', 'ac_id', 'status'],
      additionalProperties: false,
    },
  },
  {
    name: 'state_history_append',
    description:
      'Append a single history event for a task. The event text may be passed as either ' +
      '`event` (canonical) or `note` (legacy alias accepted by the handler).',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        event: { type: 'string' },
        note: { type: 'string' },
        phase: { type: 'string' },
        status: { type: 'string' },
        history_cap: { type: 'integer' },
      },
      required: ['task_id'],
      anyOf: [{ required: ['event'] }, { required: ['note'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'memory_notepad_read',
    description: 'Read notepad.md and return the three marker-bounded sections.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path; default notepad.md' },
        workspace: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'memory_notepad_append_working',
    description: 'Append one ISO-8601 timestamped line to Working Memory in notepad.md.',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        path: { type: 'string' },
        workspace: { type: 'string' },
      },
      required: ['note'],
      additionalProperties: false,
    },
  },
  {
    name: 'memory_project_memory_read',
    description: 'Read project-memory.json from the workspace root.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        workspace: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'memory_project_memory_set_directive',
    description: 'Append a directive to userOwned.directives (idempotent).',
    inputSchema: {
      type: 'object',
      properties: {
        directive: { type: 'string' },
        path: { type: 'string' },
        workspace: { type: 'string' },
      },
      required: ['directive'],
      additionalProperties: false,
    },
  },
  {
    name: 'memory_wiki_log_append',
    description: 'Append one line to docs/wiki/log.md (append-only wiki log).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'add, update, or archive' },
        slug: { type: 'string' },
        note: { type: 'string' },
        path: { type: 'string' },
        workspace: { type: 'string' },
      },
      required: ['slug'],
      additionalProperties: false,
    },
  },
];

export const FUNCTIONAL_TOOLS: Record<string, Function> = {
  state_read: stateIo.state_read,
  state_init: stateIo.state_init,
  state_set_phase: stateIo.state_set_phase,
  state_record_failure: stateIo.state_record_failure,
  state_update_acceptance_criterion: stateIo.state_update_acceptance_criterion,
  state_history_append: stateIo.state_history_append,
  memory_notepad_read: memoryIo.memory_notepad_read,
  memory_notepad_append_working: memoryIo.memory_notepad_append_working,
  memory_project_memory_read: memoryIo.memory_project_memory_read,
  memory_project_memory_set_directive: memoryIo.memory_project_memory_set_directive,
  memory_wiki_log_append: memoryIo.memory_wiki_log_append,
};

function okResponse(reqId: any, result: any): any {
  return { jsonrpc: '2.0', id: reqId, result };
}

function errResponse(reqId: any, code: number, message: string): any {
  return { jsonrpc: '2.0', id: reqId, error: { code, message } };
}

function sendResponse(obj: any): void {
  // Ensure space after colons in JSON output
  const line = JSON.stringify(obj).replace(/":/g, '": ') + '\n';
  process.stdout.write(line);
}

export class Server {
  private workspace: string;
  private taskId: string;
  private authRequired: boolean;
  private authPassed: boolean;

  constructor(workspace: string, taskId: string = '') {
    this.workspace = path.resolve(workspace);
    this.taskId = taskId;
    this.authRequired = authModule.expectedToken() !== null;
    this.authPassed = !this.authRequired;
  }

  public serve(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const req = JSON.parse(trimmed);
        this.dispatch(req);
      } catch (err: any) {
        sendResponse(errResponse(null, -32700, `parse error: ${err.message}`));
      }
    });
  }

  private dispatch(req: any): void {
    const reqId = req && typeof req === 'object' ? req.id : null;
    const method = req && typeof req === 'object' ? req.method || '' : '';
    const params = req && typeof req === 'object' ? req.params || {} : {};

    const start = performance.now();
    let resultLabel = 'ok';
    let errorClass = '';
    let toolLabel = method || '';
    let taskIdLabel = '';

    try {
      if (method === 'initialize') {
        if (!authModule.authenticate(params)) {
          this.authPassed = false;
          sendResponse(errResponse(reqId, -32001, 'unauthorized: missing or invalid OH_MY_CURSOR_MCP_TOKEN'));
          resultLabel = 'error';
          errorClass = '-32001';
        } else {
          this.authPassed = true;
          sendResponse(okResponse(reqId, this.handleInitialize()));
        }
      } else if (this.authRequired && !this.authPassed) {
        sendResponse(errResponse(reqId, -32001, 'unauthorized: complete initialize with OH_MY_CURSOR_MCP_TOKEN first'));
        resultLabel = 'error';
        errorClass = '-32001';
      } else if (method === 'tools/list') {
        sendResponse(okResponse(reqId, this.handleToolsList()));
      } else if (method === 'tools/call') {
        if (params && typeof params === 'object') {
          toolLabel = params.name || method;
          const args = params.arguments || {};
          if (args && typeof args === 'object' && typeof args.task_id === 'string') {
            taskIdLabel = args.task_id;
          }
        }
        this.handleToolsCall(reqId, params);
      } else {
        sendResponse(errResponse(reqId, -32601, `unknown method: ${method}`));
        resultLabel = 'error';
        errorClass = '-32601';
      }
    } catch (exc: any) {
      if (exc instanceof JailError) {
        sendResponse(errResponse(reqId, -32602, exc.message));
        resultLabel = 'error';
        errorClass = '-32602';
      } else {
        sendResponse(errResponse(reqId, -32603, `internal error: ${exc.message || exc}`));
        resultLabel = 'error';
        errorClass = '-32603';
      }
    } finally {
      const durationMs = performance.now() - start;
      const record: any = {
        tool: toolLabel,
        phase: method || '?',
        result: resultLabel,
        duration_ms: Math.round(durationMs * 1000) / 1000,
      };
      if (taskIdLabel) {
        record.task_id = taskIdLabel;
      }
      if (errorClass) {
        record.error_class = errorClass;
      }
      traceModule.trace(this.workspace, record);
    }
  }

  private handleInitialize(): any {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'cursor-state-bridge', version: '0.1.0' },
      capabilities: { tools: {} },
    };
  }

  private handleToolsList(): any {
    return { tools: TOOLS };
  }

  private handleToolsCall(reqId: any, params: any): void {
    if (!params || typeof params !== 'object') {
      sendResponse(errResponse(reqId, -32600, 'invalid params: expected object'));
      return;
    }

    const toolName = params.name || '';
    const toolParams = params.arguments || {};

    if (toolName in FUNCTIONAL_TOOLS) {
      const handler = FUNCTIONAL_TOOLS[toolName];
      try {
        const result = handler(this.workspace, toolParams);
        sendResponse(okResponse(reqId, result));
      } catch (exc: any) {
        if (exc instanceof JailError) {
          sendResponse(errResponse(reqId, -32602, exc.message));
        } else if (exc instanceof ValueError || exc instanceof TypeError || exc instanceof KeyError) {
          sendResponse(errResponse(reqId, -32602, `invalid params: ${exc.message}`));
        } else {
          // Check for process.exit/SystemExit failures that were standard in python
          const isFailMsg = exc.message && exc.message.startsWith('FAIL:');
          if (isFailMsg) {
            sendResponse(errResponse(reqId, -32602, `invalid params: ${exc.message}`));
          } else {
            sendResponse(errResponse(reqId, -32603, `internal error: ${exc.message || exc}`));
          }
        }
      }
    } else {
      sendResponse(errResponse(reqId, -32601, `unknown tool: ${toolName}`));
    }
  }
}

// Dummy exception classes to ease translation
class ValueError extends Error {}
class TypeError extends Error {}
class KeyError extends Error {}
