import { describe, expect, test } from 'bun:test';
import server from '../package.json';
import shim from '../../mcp-stdio/package.json';

// Rule 3, at the manifest: the lint rule catches an import, this catches the dependency that would allow one.
const ALLOWED = {
  server: ['@modelcontextprotocol/server', '@nothingleft/format', '@nothingleft/i18n', '@nothingleft/types', 'zod'],
  shim: [] as string[],
};

describe('the MCP packages depend on nothing past the REST API', () => {
  test('packages/mcp-server', () => {
    expect(Object.keys(server.dependencies).sort()).toEqual(ALLOWED.server);
  });

  test('packages/mcp-stdio ships with no runtime dependency at all', () => {
    expect(Object.keys((shim as { dependencies?: object }).dependencies ?? {})).toEqual(ALLOWED.shim);
  });
});
