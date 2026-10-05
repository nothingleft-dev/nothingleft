import { afterAll, describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const seen: { auth: string | null; body: string }[] = [];

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const body = await request.text();
    seen.push({ auth: request.headers.get('authorization'), body });
    const { id, method } = JSON.parse(body);
    if (id === undefined) return new Response(null, { status: 202 });
    const result = method === 'initialize' ? { protocolVersion: '2025-06-18' } : { tools: [] };
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    });
  },
});

afterAll(() => server.stop(true));

async function run(env: Record<string, string>, input: string) {
  const child = Bun.spawn(['node', bin], {
    env: { PATH: process.env['PATH']!, ...env },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  child.stdin.write(input);
  child.stdin.end();
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

describe('the built bin, under node', () => {
  test('proxies stdio to the HTTP endpoint', async () => {
    const { stdout, code } = await run(
      { NOTHINGLEFT_TOKEN: 'nl_pat_abc', NOTHINGLEFT_MCP_URL: `http://127.0.0.1:${server.port}/mcp` },
      [
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
        '{"jsonrpc":"2.0","method":"notifications/initialized"}',
        '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
        '',
      ].join('\n'),
    );
    expect(code).toBe(0);
    const lines = stdout
      .trim()
      .split('\n')
      .map(l => JSON.parse(l));
    expect(lines.map(l => l.id).sort()).toEqual([1, 2]);
    expect(seen.every(s => s.auth === 'Bearer nl_pat_abc')).toBe(true);
  });

  test('refuses to start without a token, and says how to get one', async () => {
    const { stderr, code } = await run({}, '');
    expect(code).toBe(1);
    expect(stderr).toContain('NOTHINGLEFT_TOKEN');
  });
});
