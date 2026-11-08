import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import mcpPackage from '../../../packages/mcp/package.json';
import { testApp } from './helpers.ts';
import { rpcAnswer } from './mcp-client.ts';
import { mailbox, signUp, uniqueStamp } from './people.ts';

// Rules from the MCP specification (base protocol, lifecycle, Streamable HTTP, tools, resources,
// prompts) that any client may rely on. Each test names the rule; none restates our own design.

setDefaultTimeout(120_000);

type App = Awaited<ReturnType<typeof testApp>>;
let app: App;
let token = '';

async function injectFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => (headers[name] = value));
  const res = await app.inject({
    method: request.method as 'GET',
    url: url.pathname + url.search,
    headers,
    ...(request.body ? { payload: await request.text() } : {}),
  });
  return new Response(res.body, { status: res.statusCode, headers: res.headers as Record<string, string> });
}

const VERSION = '2025-06-18';

function post(body: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': VERSION,
      authorization: `Bearer ${token}`,
      ...headers,
    },
    payload: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const request = async (method: string, params?: object, id: number | string = 1) =>
  rpcAnswer((await post({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })).body) as {
    jsonrpc?: string;
    id?: unknown;
    result?: Record<string, unknown>;
    error?: { code: number; message: string };
  };

beforeAll(async () => {
  const box = mailbox();
  app = await testApp({ mailer: box.mailer, mcpFetch: injectFetch });
  const owner = await signUp(app, box, 'Conformance');
  const org = await app.inject({
    method: 'POST',
    url: '/v1/organizations',
    headers: owner.headers,
    payload: { name: 'Conformance', slug: `conf-${uniqueStamp()}` },
  });
  expect(org.statusCode).toBe(201);
  const pat = await app.inject({
    method: 'POST',
    url: '/v1/me/tokens',
    headers: owner.headers,
    payload: { name: 'conformance', scopes: ['issues:read'] },
  });
  token = pat.json().data.token;
});

afterAll(async () => {
  await app.close();
});

describe('lifecycle', () => {
  test('initialize answers the protocol version, capabilities and server info', async () => {
    const { result, id, jsonrpc } = await request('initialize', {
      protocolVersion: VERSION,
      capabilities: {},
      clientInfo: { name: 'conformance', version: '0' },
    });
    expect(jsonrpc).toBe('2.0');
    expect(id).toBe(1);
    expect(result!['protocolVersion']).toBe(VERSION);
    expect(result!['capabilities']).toHaveProperty('tools');
    expect(result!['serverInfo']).toMatchObject({ name: 'nothingleft', version: mcpPackage.version });
  });

  test('an unsupported requested version is answered with a version the server supports', async () => {
    const { result, error } = await request('initialize', {
      protocolVersion: '1999-01-01',
      capabilities: {},
      clientInfo: { name: 'conformance', version: '0' },
    });
    expect(error).toBeUndefined();
    expect(result!['protocolVersion']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result!['protocolVersion']).not.toBe('1999-01-01');
  });

  test('ping answers an empty result', async () => {
    expect((await request('ping')).result).toEqual({});
  });
});

describe('base protocol', () => {
  test('a string request id is echoed back unchanged', async () => {
    expect((await request('ping', undefined, 'req-7')).id).toBe('req-7');
  });

  test('an unknown method is -32601 Method not found', async () => {
    expect((await request('no/such/method')).error?.code).toBe(-32601);
  });

  test('a body that is not JSON is -32700 Parse error', async () => {
    const res = await post('{"jsonrpc":"2.0", nope');
    expect(rpcAnswer(res.body).error?.code).toBe(-32700);
  });

  test('a notification is accepted with 202 and no body', async () => {
    const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.statusCode).toBe(202);
    expect(res.body).toBe('');
  });
});

describe('Streamable HTTP', () => {
  test('a POST that does not accept both JSON and an event stream is refused with 406', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { accept: 'application/json' });
    expect(res.statusCode).toBe(406);
  });
});

describe('tools', () => {
  test('every tool has a valid name, an object input schema and boolean hints', async () => {
    const { result } = await request('tools/list');
    const tools = result!['tools'] as {
      name: string;
      inputSchema: { type: string };
      annotations?: Record<string, unknown>;
    }[];
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
      expect(tool.inputSchema.type).toBe('object');
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
        const value = tool.annotations?.[hint];
        if (value !== undefined) expect(typeof value).toBe('boolean');
      }
    }
    expect(new Set(tools.map(t => t.name)).size).toBe(tools.length);
  });

  test('calling an unknown tool is -32602 Invalid params', async () => {
    expect((await request('tools/call', { name: 'no_such_tool', arguments: {} })).error?.code).toBe(-32602);
  });

  test('a tool that fails reports it in the result with isError, as content the model can read', async () => {
    const { result, error } = await request('tools/call', { name: 'get_issue', arguments: {} });
    expect(error).toBeUndefined();
    expect(result!['isError']).toBe(true);
    const content = result!['content'] as { type: string; text: string }[];
    expect(content[0]!.type).toBe('text');
    expect(content[0]!.text.length).toBeGreaterThan(0);
  });
});

describe('resources and prompts', () => {
  test('resource templates carry a URI template and a name', async () => {
    const { result } = await request('resources/templates/list');
    const templates = result!['resourceTemplates'] as { uriTemplate: string; name: string }[];
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) {
      expect(typeof t.uriTemplate).toBe('string');
      expect(typeof t.name).toBe('string');
    }
  });

  test('prompts carry a name, and an unknown prompt is -32602 Invalid params', async () => {
    const { result } = await request('prompts/list');
    for (const p of result!['prompts'] as { name: string }[]) expect(typeof p.name).toBe('string');
    expect((await request('prompts/get', { name: 'no_such_prompt' })).error?.code).toBe(-32602);
  });
});
