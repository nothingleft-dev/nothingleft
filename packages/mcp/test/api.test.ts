import { describe, expect, test } from 'bun:test';
import { apiClient } from '../src/api.ts';
import { ToolError } from '../src/errors.ts';

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data, meta: { request_id: 'r' } }), {
    headers: { 'content-type': 'application/json' },
  });

function recorder(respond: (r: Request, n: number) => Response | Promise<Response>) {
  const seen: Request[] = [];
  return {
    seen,
    fetch: async (r: Request) => {
      seen.push(r);
      return respond(r, seen.length);
    },
  };
}

describe('apiClient', () => {
  test('passes the PAT through and names the organisation only when asked', async () => {
    const rec = recorder(() => ok([]));
    const api = apiClient({ baseUrl: 'http://127.0.0.1:4000', token: 'nl_pat_x', fetch: rec.fetch });
    await api.get('/v1/projects', { query: { limit: 20, archived: undefined } });
    await api.get('/v1/projects', { org: 'acme' });
    expect(rec.seen[0]!.headers.get('authorization')).toBe('Bearer nl_pat_x');
    expect(rec.seen[0]!.url).toBe('http://127.0.0.1:4000/v1/projects?limit=20');
    expect(rec.seen[0]!.headers.get('x-organization')).toBeNull();
    expect(rec.seen[1]!.headers.get('x-organization')).toBe('acme');
  });

  test('sets an Idempotency-Key on every write, and none on reads', async () => {
    const rec = recorder(() => ok({}));
    const api = apiClient({ baseUrl: 'http://x', token: 't', fetch: rec.fetch });
    await api.get('/v1/me');
    await api.send('POST', '/v1/a', { body: {} });
    await api.send('PATCH', '/v1/a', { body: {} });
    await api.send('DELETE', '/v1/a');
    expect(rec.seen[0]!.headers.get('idempotency-key')).toBeNull();
    const keys = rec.seen.slice(1).map(r => r.headers.get('idempotency-key'));
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(3);
  });

  test('a dropped connection is retried once with the same key', async () => {
    const rec = recorder((_r, n) => {
      if (n === 1) throw new TypeError('socket hang up');
      return ok({ key: 'PP' });
    });
    const api = apiClient({ baseUrl: 'http://x', token: 't', fetch: rec.fetch });
    expect((await api.send('POST', '/v1/a', { body: {} })).data).toEqual({ key: 'PP' });
    expect(rec.seen[0]!.headers.get('idempotency-key')).toBe(rec.seen[1]!.headers.get('idempotency-key'));
    expect(api.calls).toBe(2);
  });

  test('the error envelope becomes a ToolError carrying valid_values', async () => {
    const api = apiClient({
      baseUrl: 'http://x',
      token: 't',
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: { code: 'organization_ambiguous', message: 'm', field: 'org', valid_values: ['a', 'b'] },
          }),
          { status: 400 },
        ),
    });
    const error = await api.get('/v1/x').catch(e => e);
    expect(error).toBeInstanceOf(ToolError);
    expect(error.body).toMatchObject({ code: 'organization_ambiguous', valid_values: ['a', 'b'] });
  });

  test('a body with no envelope is still an instructive error', async () => {
    const api = apiClient({
      baseUrl: 'http://x',
      token: 't',
      fetch: async () => new Response('bad gateway', { status: 502 }),
    });
    expect((await api.get('/v1/x').catch(e => e)).body.code).toBe('mcp.unexpected_response');
  });
});
