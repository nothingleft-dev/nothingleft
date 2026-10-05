import { describe, expect, test } from 'bun:test';
import { EXEMPT_CATEGORIES, toolDefinitions } from '../src/index.ts';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Operation = { [key: string]: unknown; 'x-mcp-exempt'?: string };

const spec = Bun.YAML.parse(await Bun.file(new URL('../../../docs/openapi.yaml', import.meta.url)).text()) as {
  paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
};

const operations = Object.entries(spec.paths).flatMap(([route, item]) =>
  METHODS.filter(m => item[m]).map(m => ({
    endpoint: `${m.toUpperCase()} ${route}`,
    exempt: item[m]!['x-mcp-exempt'],
  })),
);
const claimed = new Map<string, string[]>();
for (const tool of toolDefinitions) {
  for (const endpoint of tool.endpoints) claimed.set(endpoint, [...(claimed.get(endpoint) ?? []), tool.name]);
}

// Roadmap 2b: every M0/M1 endpoint outside mcp.md § Deliberately UI-only has a tool.
describe('MCP parity with docs/openapi.yaml', () => {
  test('every operation has a tool, or is exempt by a named category', () => {
    const uncovered = operations.filter(o => !o.exempt && !claimed.has(o.endpoint)).map(o => o.endpoint);
    expect(uncovered).toEqual([]);
  });

  test('every exemption names a category mcp.md defines', () => {
    const unknown = operations.filter(o => o.exempt && !EXEMPT_CATEGORIES.includes(o.exempt as never));
    expect(unknown.map(o => `${o.endpoint}: ${o.exempt}`)).toEqual([]);
  });

  test('no tool calls an exempt operation', () => {
    const both = operations.filter(o => o.exempt && claimed.has(o.endpoint));
    expect(both.map(o => `${o.endpoint} (${claimed.get(o.endpoint)!.join(', ')})`)).toEqual([]);
  });

  test('every endpoint a tool declares exists', () => {
    const known = new Set(operations.map(o => o.endpoint));
    expect([...claimed.keys()].filter(e => !known.has(e))).toEqual([]);
  });
});
