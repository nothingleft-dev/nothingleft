import { describe, expect, test } from 'bun:test';
import { createProxy } from '../src/proxy.ts';

const sse = (...messages: object[]) =>
  new Response(messages.map(m => `event: message\ndata: ${JSON.stringify(m)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });

function harness(respond: (r: Request) => Response | Promise<Response>) {
  const out: object[] = [];
  const seen: Request[] = [];
  const handle = createProxy({
    url: 'http://127.0.0.1:4000/mcp',
    token: 'nl_pat_secret',
    version: '0.0.0',
    fetch: async r => {
      seen.push(r);
      return respond(r);
    },
    write: line => out.push(JSON.parse(line)),
  });
  return { handle, out, seen };
}

describe('the stdio proxy', () => {
  test('forwards each line with the PAT, and relays the streamed answer', async () => {
    const h = harness(() => sse({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }));
    await h.handle('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}');
    expect(h.seen[0]!.headers.get('authorization')).toBe('Bearer nl_pat_secret');
    expect(await h.seen[0]!.text()).toBe('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}');
    expect(h.out).toEqual([{ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }]);
  });

  test('sends the negotiated protocol version on every later request', async () => {
    const h = harness(r =>
      r.headers.get('mcp-protocol-version')
        ? sse({ jsonrpc: '2.0', id: 2, result: {} })
        : sse({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }),
    );
    await h.handle('{"jsonrpc":"2.0","id":1,"method":"initialize"}');
    await h.handle('{"jsonrpc":"2.0","id":2,"method":"tools/list"}');
    expect(h.seen[1]!.headers.get('mcp-protocol-version')).toBe('2025-06-18');
  });

  test('a notification answered 202 writes nothing', async () => {
    const h = harness(() => new Response(null, { status: 202 }));
    await h.handle('{"jsonrpc":"2.0","method":"notifications/initialized"}');
    expect(h.out).toEqual([]);
  });

  test("the API's 401 envelope becomes a JSON-RPC error the client can show", async () => {
    const h = harness(
      () =>
        new Response(JSON.stringify({ error: { code: 'auth.pat_required', message: 'Send a PAT.' } }), { status: 401 }),
    );
    await h.handle('{"jsonrpc":"2.0","id":7,"method":"tools/list"}');
    expect(h.out).toEqual([{ jsonrpc: '2.0', id: 7, error: { code: -32000, message: 'Send a PAT.' } }]);
  });

  test('an unreachable endpoint is reported against the request, never with the token', async () => {
    const h = harness(() => {
      throw new TypeError('connect ECONNREFUSED');
    });
    await h.handle('{"jsonrpc":"2.0","id":3,"method":"tools/list"}');
    expect(JSON.stringify(h.out)).toContain('Could not reach http://127.0.0.1:4000/mcp');
    expect(JSON.stringify(h.out)).not.toContain('nl_pat_secret');
  });
  const revision = {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': { elicitation: {} },
  };
  const json = (m: object) => new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json' } });

  test('derives the 2026-07-28 headers from the message itself', async () => {
    const h = harness(() => json({ jsonrpc: '2.0', id: 4, result: { content: [] } }));
    await h.handle(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'delete_issue', arguments: {}, _meta: revision },
      }),
    );
    expect(h.seen[0]!.headers.get('mcp-protocol-version')).toBe('2026-07-28');
    expect(h.seen[0]!.headers.get('mcp-method')).toBe('tools/call');
    expect(h.seen[0]!.headers.get('mcp-name')).toBe('delete_issue');
  });

  test('a name outside printable ASCII travels as base64', async () => {
    const h = harness(() => json({ jsonrpc: '2.0', id: 5, result: { contents: [] } }));
    await h.handle(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'resources/read',
        params: { uri: 'article://PP/café', _meta: revision },
      }),
    );
    expect(h.seen[0]!.headers.get('mcp-name')).toBe('=?base64?YXJ0aWNsZTovL1BQL2NhZsOp?=');
  });

  test('relays the confirmation question, then the retry that carries the answer', async () => {
    const asking = {
      jsonrpc: '2.0',
      id: 6,
      result: {
        resultType: 'input_required',
        inputRequests: {
          confirm: {
            method: 'elicitation/create',
            params: { message: 'delete_issue will delete PP-1. Go ahead?', mode: 'form' },
          },
        },
      },
    };
    const done = {
      jsonrpc: '2.0',
      id: 7,
      result: { content: [{ type: 'text', text: 'Deleted' }], resultType: 'complete' },
    };
    const h = harness(async r => json(JSON.parse(await r.text()).params.inputResponses ? done : asking));
    const call = (id: number, extra: object = {}) =>
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'delete_issue', arguments: {}, ...extra, _meta: revision },
      });
    await h.handle(call(6));
    await h.handle(call(7, { inputResponses: { confirm: { action: 'accept', content: { proceed: true } } } }));
    expect(h.out).toEqual([asking, done]);
  });
});
