import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { testApp } from './helpers.ts';
import { mailbox, origin, password, signUp, uniqueStamp, verify, type Person } from './people.ts';

type Method = 'GET' | 'POST' | 'DELETE';

const box = mailbox();
let app: Awaited<ReturnType<typeof testApp>>;

beforeAll(async () => {
  app = await testApp({ mailer: box.mailer });
});

afterAll(async () => {
  await app.close();
});

const bySession = (who: Person, method: Method, url: string, body?: object) =>
  app.inject({ method, url, headers: who.headers, ...(body ? { body } : {}) });

const byToken = (token: string, method: Method, url: string, body?: object) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(body ? { body } : {}) });

async function patFor(who: Person, scopes: string[] = ['issues:read']): Promise<{ id: number; token: string }> {
  const res = await bySession(who, 'POST', '/v1/me/tokens', { name: 'agent', scopes });
  expect(res.statusCode).toBe(201);
  return res.json().data;
}

describe('token and session management is browser-session only', () => {
  let who: Person;
  let pat: { id: number; token: string };

  beforeAll(async () => {
    who = await signUp(app, box, 'Alex');
    const again = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      headers: origin,
      body: { email: who.email, password },
    });
    expect(again.statusCode).toBe(200);
    pat = await patFor(who);
  });

  test('an access token cannot create another token', async () => {
    const res = await byToken(pat.token, 'POST', '/v1/me/tokens', {
      name: 'escalated',
      scopes: ['issues:read', 'issues:write', 'admin:project', 'admin:org'],
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('auth.session_required');

    const listed = (await bySession(who, 'GET', '/v1/me/tokens')).json().data as { name: string }[];
    expect(listed.map(t => t.name)).toEqual(['agent']);
  });

  test('an access token cannot revoke a token, itself included', async () => {
    const res = await byToken(pat.token, 'DELETE', `/v1/me/tokens/${pat.id}`);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('auth.session_required');
    expect((await byToken(pat.token, 'GET', '/v1/me')).statusCode).toBe(200);
  });

  test('an access token cannot sign a session out, one or all', async () => {
    const listed = async () =>
      ((await bySession(who, 'GET', '/v1/me/sessions')).json().data as { id: number; current: boolean }[]).sort(
        (a, b) => a.id - b.id,
      );
    const before = await listed();
    expect(before).toHaveLength(2);
    const other = before.find(s => !s.current)!.id;

    const one = await byToken(pat.token, 'DELETE', `/v1/me/sessions/${other}`);
    expect(one.statusCode).toBe(403);
    expect(one.json().error.code).toBe('auth.session_required');

    const all = await byToken(pat.token, 'DELETE', '/v1/me/sessions');
    expect(all.statusCode).toBe(403);
    expect(all.json().error.code).toBe('auth.session_required');

    expect((await listed()).map(s => s.id)).toEqual(before.map(s => s.id));
  });

  test('an access token can still list tokens and sessions', async () => {
    expect((await byToken(pat.token, 'GET', '/v1/me/tokens')).statusCode).toBe(200);
    const sessions = await byToken(pat.token, 'GET', '/v1/me/sessions');
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json().data.length).toBeGreaterThan(0);
  });
});

describe('an unverified account', () => {
  let pending: Person;

  beforeAll(async () => {
    pending = await signUp(app, box, 'Pending', { verify: false });
  });

  test('cannot create an access token', async () => {
    const res = await bySession(pending, 'POST', '/v1/me/tokens', { name: 'agent', scopes: ['issues:read'] });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('auth.email_unverified');
    expect((await bySession(pending, 'GET', '/v1/me/tokens')).json().data).toEqual([]);
  });

  test('cannot start an email change', async () => {
    const res = await bySession(pending, 'POST', '/v1/me/email-change', {
      current_password: password,
      email: `moved-${uniqueStamp()}@test.local`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('auth.email_unverified');
    expect(box.sent.some(m => m.subject === 'email.email_change_verify.subject')).toBe(false);
  });

  test('can do both once the address is verified', async () => {
    await verify(app, box, pending.email);
    expect((await patFor(pending)).token).toStartWith('nl_pat_');
    const change = await bySession(pending, 'POST', '/v1/me/email-change', {
      current_password: password,
      email: `moved-${uniqueStamp()}@test.local`,
    });
    expect(change.statusCode).toBe(200);
  });
});
