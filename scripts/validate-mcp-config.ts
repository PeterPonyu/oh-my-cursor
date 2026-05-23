import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(currentFile), '..');

const PLUGIN_MANIFEST = path.join(ROOT, '.cursor-plugin', 'plugin.json');
const DEFAULT_MCP_EXAMPLE = path.join(ROOT, '.cursor', 'mcp.example.json');
const USER_MCP_CONFIG = path.join(ROOT, '.cursor', 'mcp.json');
const PLACEHOLDER_TOKEN = '<placeholder>';
const REQUIRED_SERVER = 'cursor-state-bridge';

function loadJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    console.error(`FAIL: ${path.relative(ROOT, filePath)} is not valid JSON: ${err.message}`);
    process.exit(2);
  }
}

function checkManifest(): string {
  const manifest = loadJson(PLUGIN_MANIFEST);
  if (manifest === null) {
    console.error(`FAIL: plugin manifest missing at ${path.relative(ROOT, PLUGIN_MANIFEST)}`);
    process.exit(2);
  }
  const mcpField = manifest.mcp;
  if (typeof mcpField !== 'string' || !mcpField) {
    console.log(`WARN: plugin.json has no \`mcp\` field; defaulting to ${path.relative(ROOT, DEFAULT_MCP_EXAMPLE)}`);
    return DEFAULT_MCP_EXAMPLE;
  }
  const target = path.resolve(ROOT, mcpField);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    console.error(`FAIL: plugin.json \`mcp\` points to missing file ${mcpField}`);
    process.exit(2);
  }
  return target;
}

function checkExample(examplePath: string): boolean {
  const example = loadJson(examplePath);
  if (example === null) {
    console.error(`FAIL: MCP example missing at ${path.relative(ROOT, examplePath)}`);
    return false;
  }
  const servers = example.mcpServers;
  if (!servers || typeof servers !== 'object' || !(REQUIRED_SERVER in servers)) {
    console.error(`FAIL: ${path.relative(ROOT, examplePath)} does not declare \`${REQUIRED_SERVER}\` under mcpServers`);
    return false;
  }
  return true;
}

function checkUserConfig(): boolean {
  if (!fs.existsSync(USER_MCP_CONFIG) || !fs.statSync(USER_MCP_CONFIG).isFile()) {
    console.log(
      `WARN: ${path.relative(ROOT, USER_MCP_CONFIG)} not present. Cursor will not auto-load the bridge ` +
      `until you copy ${path.relative(ROOT, DEFAULT_MCP_EXAMPLE)} -> ${path.relative(ROOT, USER_MCP_CONFIG)}.`
    );
    return true;
  }
  const user = loadJson(USER_MCP_CONFIG);
  if (user === null) {
    return false;
  }
  const servers = user.mcpServers || {};
  if (!servers || typeof servers !== 'object' || !(REQUIRED_SERVER in servers)) {
    console.log(
      `WARN: ${path.relative(ROOT, USER_MCP_CONFIG)} does not declare \`${REQUIRED_SERVER}\`. ` +
      `The bridge will not be reachable through this config.`
    );
    return true;
  }
  const raw = fs.readFileSync(USER_MCP_CONFIG, 'utf-8');
  if (raw.includes(PLACEHOLDER_TOKEN)) {
    console.error(
      `FAIL: ${path.relative(ROOT, USER_MCP_CONFIG)} contains literal \`${PLACEHOLDER_TOKEN}\` token. ` +
      `Replace with a real OH_MY_CURSOR_MCP_TOKEN value or remove the env block (auth defaults OFF).`
    );
    return false;
  }
  console.log(`OK: ${path.relative(ROOT, USER_MCP_CONFIG)} declares \`${REQUIRED_SERVER}\` and contains no placeholder token.`);
  return true;
}

function main() {
  const examplePath = checkManifest();
  if (!checkExample(examplePath)) {
    process.exit(1);
  }
  console.log(`OK: plugin manifest declares MCP at ${path.relative(ROOT, examplePath)} with \`${REQUIRED_SERVER}\`.`);
  if (!checkUserConfig()) {
    process.exit(1);
  }
  process.exit(0);
}

main();
