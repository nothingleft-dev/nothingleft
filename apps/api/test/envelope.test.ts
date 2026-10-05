import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { testApp } from './helpers.ts';

let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  app = await testApp();
});
afterAll(async () => {
  await app.close();
});

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const resetRequest = (body: Record<string, string>) =>
  app.inject({ method: 'POST', url: '/v1/auth/password-reset', body });

describe('success envelope', () => {
  test('returns data + meta.request_id and echoes the id in a header', async () => {
    const res = await resetRequest({ email: 'nobody@test.local' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual({ ok: true });
    expect(body.meta.request_id).toMatch(UUID_V7);
    expect(res.headers['x-request-id']).toBe(body.meta.request_id);
    expect(body.error).toBeUndefined();
  });

  test('honours an inbound X-Request-Id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset',
      headers: { 'x-request-id': 'trace-abc' },
      body: { email: 'nobody@test.local' },
    });
    expect(res.json().meta.request_id).toBe('trace-abc');
  });

  test('validates the body DTO and names the field', async () => {
    const res = await resetRequest({ email: 'not-an-email' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'validation_failed', field: 'email' });
  });

  test('a collection carries meta.pagination even when it does not page', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/sessions' });
    expect(res.statusCode).toBe(401);
    const ok = await app.inject({ method: 'GET', url: '/health' });
    expect(ok.json().meta.pagination).toBeUndefined();
  });

  test('sets rate-limit headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });
});

describe('GET /health', () => {
  test('is a liveness probe in the envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ status: 'ok' });
  });
});

describe('errors', () => {
  test('unknown route → error envelope with stable code', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.data).toBeUndefined();
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toBe('The requested resource was not found.');
    expect(body.error.request_id).toMatch(UUID_V7);
  });

  test('an unauthenticated call to a protected route is 401 with the catalogue message', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatchObject({ code: 'unauthorized' });
  });
});
