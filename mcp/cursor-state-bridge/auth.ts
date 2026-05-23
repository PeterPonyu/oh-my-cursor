import * as process from 'node:process';

export const ENV_TOKEN_NAME = 'OH_MY_CURSOR_MCP_TOKEN';

export function expectedToken(): string | null {
  const raw = (process.env[ENV_TOKEN_NAME] || '').trim();
  return raw || null;
}

export function authenticate(initializeParams: any): boolean {
  const expected = expectedToken();
  if (expected === null) {
    return true;
  }
  if (!initializeParams || typeof initializeParams !== 'object' || Array.isArray(initializeParams)) {
    return false;
  }
  return initializeParams.token === expected;
}
