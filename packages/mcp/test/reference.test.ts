import { describe, expect, test } from 'bun:test';
import { TOOL_GROUPS, toolReference } from '../src/reference.ts';
import { promptDefinitions, resourceDefinitions, TOOL_NAMES } from '../src/index.ts';

const read = (path: string) => Bun.file(new URL(`../../../docs/${path}`, import.meta.url)).text();

// The docs-are-part-of-the-change rule for MCP: the reference is regenerated, never hand-edited.
describe('the MCP tool reference', () => {
  test('docs/manual/mcp-tools.md is what the definitions generate', async () => {
    expect(await read('manual/mcp-tools.md'), 'run `bun run --cwd packages/mcp docs:tools`').toBe(toolReference());
  });

  test('every tool sits in exactly one section', () => {
    const grouped = Object.values(TOOL_GROUPS).flat();
    expect([...grouped].sort()).toEqual([...TOOL_NAMES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  test('mcp.md and the user manual name every tool, resource and prompt', async () => {
    const [design, manual] = await Promise.all([read('mcp.md'), read('manual/mcp.md')]);
    const names = [
      ...TOOL_NAMES,
      ...resourceDefinitions.map(r => `${r.name}://`),
      ...promptDefinitions.map(p => p.name),
    ];
    expect(names.filter(n => !design.includes(`\`${n}`))).toEqual([]);
    expect(names.filter(n => !manual.includes(`\`${n}`))).toEqual([]);
  });

  test('descriptions stay short enough for a client to show whole', () => {
    const long = toolReference()
      .split('\n')
      .filter(l => l.length > 1000);
    expect(long).toEqual([]);
  });
});
