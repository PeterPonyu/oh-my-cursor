import * as fs from 'node:fs';
import * as path from 'node:path';
import { JailError } from './jail.ts';

const WORKING_START = "<!-- OMCS:NOTEPAD:WORKING -->";
const WORKING_END = "<!-- /OMCS:NOTEPAD:WORKING -->";
const PRIORITY_START = "<!-- OMCS:NOTEPAD:PRIORITY -->";
const PRIORITY_END = "<!-- /OMCS:NOTEPAD:PRIORITY -->";
const MANUAL_START = "<!-- OMCS:NOTEPAD:MANUAL -->";
const MANUAL_END = "<!-- /OMCS:NOTEPAD:MANUAL -->";

const MEMORY_ALLOWLIST = new Set([
  "notepad.md",
  "project-memory.json",
  "docs/wiki/log.md",
]);

function failEscape(message: string): JailError {
  return new JailError(message);
}

function resolveMemoryPath(workspace: string, relative: string): string {
  if (typeof relative !== 'string' || !relative.trim()) {
    throw new Error("path is required");
  }
  const rel = relative.trim();
  if (path.isAbsolute(rel) || rel.split(path.sep).includes('..') || rel.split('/').includes('..')) {
    throw failEscape(`memory path not allowed: ${relative}`);
  }
  const normalized = rel.replace(/\\/g, '/');
  if (!MEMORY_ALLOWLIST.has(normalized)) {
    throw failEscape(`memory path not on allowlist: ${normalized}`);
  }
  
  const workspaceReal = fs.realpathSync(path.resolve(workspace));
  const target = path.resolve(workspaceReal, rel);
  let resolved: string;
  try {
    resolved = fs.realpathSync(target);
  } catch {
    resolved = path.resolve(target);
  }
  
  const relativeToWorkspace = path.relative(workspaceReal, resolved);
  if (relativeToWorkspace.startsWith('..') || path.isAbsolute(relativeToWorkspace)) {
    throw failEscape(`memory path escapes workspace: ${relative}`);
  }
  return resolved;
}

function mcpText(payload: any): any {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return { content: [{ type: 'text', text }] };
}

function atomicWrite(filePath: string, text: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, text, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function extractBetween(text: string, start: string, end: string): string {
  const startIdx = text.indexOf(start);
  const endIdx = text.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`notepad missing markers '${start}' / '${end}'`);
  }
  return text.substring(startIdx + start.length, endIdx);
}

function parseNotepadSections(text: string): Record<string, string> {
  return {
    priority: extractBetween(text, PRIORITY_START, PRIORITY_END).trim(),
    working: extractBetween(text, WORKING_START, WORKING_END).trim(),
    manual: extractBetween(text, MANUAL_START, MANUAL_END).trim(),
    raw: text,
  };
}

function activeWorkspace(workspace: string, params: any): string {
  const workspaceStr = params.workspace;
  const workspaceReal = fs.realpathSync(path.resolve(workspace));
  if (workspaceStr) {
    const requested = path.resolve(workspaceStr);
    let requestedReal: string;
    try {
      requestedReal = fs.realpathSync(requested);
    } catch {
      requestedReal = requested;
    }
    const relativeToWorkspace = path.relative(workspaceReal, requestedReal);
    if (relativeToWorkspace.startsWith('..') || path.isAbsolute(relativeToWorkspace)) {
      throw failEscape(`memory workspace override escapes configured workspace: ${workspaceStr}`);
    }
    return requestedReal;
  }
  return workspaceReal;
}

export function memory_notepad_read(workspace: string, params: any): any {
  const active = activeWorkspace(workspace, params);
  const rel = params.path !== undefined ? String(params.path) : "notepad.md";
  const target = resolveMemoryPath(active, rel);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return mcpText({ path: rel, exists: false, sections: null });
  }
  const text = fs.readFileSync(target, 'utf-8');
  const sections = parseNotepadSections(text);
  return mcpText({ path: rel, exists: true, sections: sections });
}

export function memory_notepad_append_working(workspace: string, params: any): any {
  const active = activeWorkspace(workspace, params);
  const rel = params.path !== undefined ? String(params.path) : "notepad.md";
  const note = params.note;
  if (typeof note !== 'string' || !note.trim()) {
    throw new Error("memory_notepad_append_working: note is required");
  }
  const target = resolveMemoryPath(active, rel);
  let text = "";
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    text = fs.readFileSync(target, 'utf-8');
  } else {
    const template = path.join(active, "docs", "templates", "notepad.md");
    if (fs.existsSync(template) && fs.statSync(template).isFile()) {
      text = fs.readFileSync(template, 'utf-8');
    } else {
      throw new Error(`notepad not found at ${rel} and no template at docs/templates/notepad.md`);
    }
  }
  const line = `${utcNow()} ${note.trim()}\n`;
  let workingBody = extractBetween(text, WORKING_START, WORKING_END);
  if (workingBody && !workingBody.endsWith("\n")) {
    workingBody += "\n";
  }
  const newWorking = workingBody + line;
  const startIdx = text.indexOf(WORKING_START);
  const endIdx = text.indexOf(WORKING_END);
  const updated = text.substring(0, startIdx + WORKING_START.length) + newWorking + text.substring(endIdx);
  atomicWrite(target, updated);
  return mcpText({ path: rel, appended: line.trim() });
}

export function memory_project_memory_read(workspace: string, params: any): any {
  const active = activeWorkspace(workspace, params);
  const rel = params.path !== undefined ? String(params.path) : "project-memory.json";
  const target = resolveMemoryPath(active, rel);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return mcpText({ path: rel, exists: false, document: null });
  }
  let document: any;
  try {
    const raw = fs.readFileSync(target, 'utf-8');
    document = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`project memory parse error: ${err.message}`);
  }
  return mcpText({ path: rel, exists: true, document: document });
}

export function memory_project_memory_set_directive(workspace: string, params: any): any {
  const active = activeWorkspace(workspace, params);
  const rel = params.path !== undefined ? String(params.path) : "project-memory.json";
  const directive = params.directive;
  if (typeof directive !== 'string' || !directive.trim()) {
    throw new Error("memory_project_memory_set_directive: directive is required");
  }
  const cleanDirective = directive.trim();
  const target = resolveMemoryPath(active, rel);
  let data: any;
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    try {
      data = JSON.parse(fs.readFileSync(target, 'utf-8'));
    } catch (err: any) {
      throw new Error(`project memory parse error: ${err.message}`);
    }
  } else {
    const template = path.join(active, "docs", "templates", "project-memory.json");
    if (!fs.existsSync(template) || !fs.statSync(template).isFile()) {
      throw new Error(`project memory not found at ${rel} and no template at docs/templates/project-memory.json`);
    }
    try {
      data = JSON.parse(fs.readFileSync(template, 'utf-8'));
    } catch (err: any) {
      throw new Error(`project memory template parse error: ${err.message}`);
    }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error("project memory root must be a JSON object");
  }
  if (typeof data.userOwned !== 'object' || data.userOwned === null || Array.isArray(data.userOwned)) {
    data.userOwned = { customNotes: [], directives: [] };
  }
  if (!Array.isArray(data.userOwned.directives)) {
    data.userOwned.directives = [];
  }
  const directives = data.userOwned.directives as string[];
  if (!directives.includes(cleanDirective)) {
    directives.push(cleanDirective);
  }
  const serialized = JSON.stringify(data, null, 2) + "\n";
  atomicWrite(target, serialized);
  return mcpText({ path: rel, directive: cleanDirective, directives: directives });
}

const WIKI_LOG_ENTRY_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+\S/;

export function memory_wiki_log_append(workspace: string, params: any): any {
  const active = activeWorkspace(workspace, params);
  const rel = params.path !== undefined ? String(params.path) : "docs/wiki/log.md";
  const action = params.action !== undefined ? String(params.action) : "update";
  const slug = params.slug;
  let note = params.note;
  if (typeof action !== 'string' || !['add', 'update', 'archive'].includes(action)) {
    throw new Error("memory_wiki_log_append: action must be add, update, or archive");
  }
  if (typeof slug !== 'string' || !slug.trim()) {
    throw new Error("memory_wiki_log_append: slug is required");
  }
  if (typeof note !== 'string') {
    note = "";
  }
  const cleanSlug = slug.trim();
  const target = resolveMemoryPath(active, rel);
  let text = "";
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    text = fs.readFileSync(target, 'utf-8');
  } else {
    const template = path.join(active, "docs", "templates", "wiki-log.md");
    if (fs.existsSync(template) && fs.statSync(template).isFile()) {
      text = fs.readFileSync(template, 'utf-8');
    } else {
      text = "# Wiki log\n\n## Entries\n\n";
    }
  }
  const line = `${utcNow()}  ${action}  ${cleanSlug}  ${note.trim()}\n`;
  if (!WIKI_LOG_ENTRY_RE.test(line.trim())) {
    throw new Error(`invalid wiki log line: '${line.trim()}'`);
  }
  if (text && !text.endsWith("\n") && !text.endsWith("\r\n")) {
    text += "\n";
  }
  const updated = text + line;
  atomicWrite(target, updated);
  return mcpText({ path: rel, appended: line.trim() });
}
