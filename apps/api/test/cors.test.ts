import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { CORS_EXPOSED_HEADERS } from '@config/constants';
import { testApp, testEnv } from './helpers.ts';

let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  app = await testApp();
});
afterAll(async () => {
  await app.close();
});

const origin = { origin: testEnv.APP_BASE_URL };

const exposed = (value: string | string[] | undefined) =>
  String(value ?? '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);

describe('CORS', () => {
  test('allows the web app origin with credentials', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: origin });
    expect(res.headers['access-control-allow-origin']).toBe(testEnv.APP_BASE_URL);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  // Without these the browser hides them: response.headers.get() returns null, silently.
  test('exposes the request id so a client can quote it in an error report', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: origin });
    expect(exposed(res.headers['access-control-expose-headers'])).toContain('x-request-id');
  });

  test('exposes the rate-limit headers a client paces itself with', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: origin });
    const names = exposed(res.headers['access-control-expose-headers']);
    expect(names).toContain('x-ratelimit-limit');
    expect(names).toContain('x-ratelimit-remaining');
    expect(names).toContain('x-ratelimit-reset');
    expect(names).toContain('retry-after');
  });

  test('exposes exactly the documented list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: origin });
    expect(exposed(res.headers['access-control-expose-headers']).sort()).toEqual([...CORS_EXPOSED_HEADERS].sort());
  });

  test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('allows %s in mutation preflights', async method => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/me',
      headers: {
        ...origin,
        'access-control-request-method': method,
        'access-control-request-headers': 'content-type,idempotency-key',
      },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(testEnv.APP_BASE_URL);
    expect(exposed(res.headers['access-control-allow-methods'])).toContain(method.toLowerCase());
    expect(exposed(res.headers['access-control-allow-headers'])).toEqual(['content-type', 'idempotency-key']);
  });
});
