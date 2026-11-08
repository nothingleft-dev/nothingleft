import { describe, expect, test } from 'bun:test';
import { createProxy } from '../src/proxy.ts';

const sse = (...messages: object[]) =>
  new Response(messages.map(m => `event: message\ndata: ${JSON.stringify(m)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });

function harness(respond: (r: Request) => Response | Promise<Response>) {
  const out: object[] = [];
  const seen: Request[] = [];
  const proxy = createProxy({
    url: 'http://127.0.0.1:4000/mcp',
    token: 'nl_pat_secret',
    version: '0.0.0',
    fetch: async r => {
      seen.push(r);
      return respond(r);
    },
    write: line => out.push(JSON.parse(line)),
  });
  return { handle: proxy.handle, close: proxy.close, out, seen };
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

  test('an open subscription stream is relayed as each event arrives, not when it ends', async () => {
    let push!: (text: string) => void;
    let end!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder();
        push = text => controller.enqueue(bytes.encode(text));
        end = () => controller.close();
      },
    });
    const h = harness(() => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
    const done = h.handle('{"jsonrpc":"2.0","id":"listen:0","method":"subscriptions/listen","params":{}}');
    push(': keepalive\n\n');
    push('data: {"jsonrpc":"2.0","method":"notifications/subscriptions/acknowledged","params":{}}\n\n');
    await Bun.sleep(10);
    expect(h.out).toEqual([{ jsonrpc: '2.0', method: 'notifications/subscriptions/acknowledged', params: {} }]);
    push('data: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}\n\n');
    end();
    await done;
    expect(h.out).toHaveLength(2);
  });

  test('a cancelled request is aborted and never answered', async () => {
    const h = harness(async r => {
      if ((await r.clone().text()).includes('notifications/cancelled')) return new Response(null, { status: 202 });
      return new Promise<Response>((_resolve, reject) =>
        r.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      );
    });
    const pending = h.handle('{"jsonrpc":"2.0","id":"listen:0","method":"subscriptions/listen","params":{}}');
    await Bun.sleep(10);
    await h.handle('{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":"listen:0"}}');
    await pending;
    expect(h.seen[0]!.signal.aborted).toBe(true);
    expect(h.out).toEqual([]);
  });

  test('an edge timeout on a live request is still reported against it', async () => {
    const h = harness(() => new Response('<html>524</html>', { status: 524 }));
    await h.handle('{"jsonrpc":"2.0","id":9,"method":"tools/list"}');
    expect(h.out).toEqual([
      { jsonrpc: '2.0', id: 9, error: { code: -32000, message: 'HTTP 524 from http://127.0.0.1:4000/mcp' } },
    ]);
  });

  test('a request cancelled while its JSON answer is still arriving ends quietly', async () => {
    let started!: () => void;
    const begun = new Promise<void>(resolve => (started = resolve));
    const h = harness(async r => {
      if ((await r.clone().text()).includes('notifications/cancelled')) return new Response(null, { status: 202 });
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"jsonrpc":"2.0",'));
          r.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
          started();
        },
      });
      return new Response(body, { headers: { 'content-type': 'application/json' } });
    });
    const pending = h.handle('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"x"}}');
    await begun;
    await h.handle('{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":3}}');
    await pending;
    expect(h.out).toEqual([]);
  });

  test('close ends every open stream, so the shim can exit when the client goes', async () => {
    const h = harness(
      r =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              r.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const pending = h.handle('{"jsonrpc":"2.0","id":"listen:0","method":"subscriptions/listen","params":{}}');
    await Bun.sleep(10);
    h.close();
    await pending;
    expect(h.out).toEqual([]);
  });

  test('close leaves an ordinary request to finish and answer', async () => {
    let answer!: (r: Response) => void;
    const h = harness(() => new Promise<Response>(resolve => (answer = resolve)));
    const pending = h.handle('{"jsonrpc":"2.0","id":5,"method":"tools/list"}');
    await Bun.sleep(10);
    h.close();
    answer(new Response(JSON.stringify({ jsonrpc: '2.0', id: 5, result: { tools: [] } })));
    await pending;
    expect(h.out).toEqual([{ jsonrpc: '2.0', id: 5, result: { tools: [] } }]);
  });

  test('a stream that sends a broken event is reported once and closed', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: not json\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const h = harness(() => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
    await h.handle('{"jsonrpc":"2.0","id":4,"method":"tools/list"}');
    expect(cancelled).toBe(true);
    expect(h.out).toHaveLength(1);
    expect((h.out[0] as { id: number }).id).toBe(4);
  });

  test('close ends an open stream even when its body never reacts to the abort', async () => {
    let cancelled = false;
    // As Node's fetch did in production: the abort reached the signal but never the piped body.
    const h = harness(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const pending = h.handle('{"jsonrpc":"2.0","id":"listen:1","method":"subscriptions/listen","params":{}}');
    await Bun.sleep(10);
    h.close();
    const settled = await Promise.race([pending.then(() => 'ended'), Bun.sleep(1000).then(() => 'still open')]);
    expect(settled).toBe('ended');
    expect(cancelled).toBe(true);
    expect(h.out).toEqual([]);
  });
});
