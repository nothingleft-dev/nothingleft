import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PAT_PREFIX, SESSION_COOKIE_NAME } from '@nothingleft/types';
import type { Message } from '@lib/email';
import { testApp, testEnv } from './helpers.ts';

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const email = `route-${stamp}@test.local`;
const password = 'a-long-enough-password';
const origin = { origin: testEnv.APP_BASE_URL };

const sent: Message[] = [];

let app: Awaited<ReturnType<typeof testApp>>;
let sid: string;

const cookie = () => ({ cookie: `${SESSION_COOKIE_NAME}=${sid}` });
const tokenFrom = (subject: string) =>
  /token=([^\s&]+)/.exec(sent.findLast(m => m.subject === subject)?.params?.['url'] as string)?.[1] ?? '';

beforeAll(async () => {
  app = await testApp({
    mailer: {
      async send(message) {
        sent.push(message);
      },
    },
  });
});

// No teardown: `users` rows are never hard-deleted (CLAUDE.md rule 9), so each run takes
// a unique address instead. CI gets a fresh Postgres container per run.
afterAll(async () => {
  await app.close();
});

describe('POST /v1/auth/sign-up', () => {
  test('creates the account, answers with the Me DTO and sets an httpOnly cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      headers: { ...origin, 'user-agent': 'Bun/test' },
      body: { email, password, name: 'Route Tester', timezone: 'Asia/Kolkata' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toMatchObject({
      email,
      name: 'Route Tester',
      timezone: 'Asia/Kolkata',
      email_verified_at: null,
      has_password: true,
      linked_providers: [],
    });
    expect(body.data.preferences).toEqual({ theme: 'system', last_project_key: null, ui: {} });
    expect(body.data.avatar_url).toEndWith('/avatars/person?seed=' + encodeURIComponent(body.data.name));

    const setCookie = res.cookies.find(c => c.name === SESSION_COOKIE_NAME);
    expect(setCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    sid = setCookie!.value;
    // 32 random bytes, base64url: nothing readable, nothing JWT-shaped.
    expect(Buffer.from(sid, 'base64url').length).toBe(32);
  });

  test('a second sign-up with the same address is refused', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      headers: origin,
      body: { email, password, name: 'Impostor' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'auth.email_taken', field: 'email' });
  });

  test('a short password fails validation before anything is written', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      headers: origin,
      body: { email: `short-${stamp}@test.local`, password: 'short', name: 'X' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'validation_failed', field: 'password' });
  });

  test('the verification link confirms the address', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      headers: origin,
      body: { token: tokenFrom('email.verify.subject') },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('the session cookie resolves a principal', () => {
  test('GET /v1/me answers for the cookie holder', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: cookie() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.email).toBe(email);
  });

  test('an unknown cookie is anonymous, not an error', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-real-session` },
    });
    expect(res.statusCode).toBe(401);
  });

  test('PATCH /v1/me returns the full resource, not a trimmed write response', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { ...cookie(), ...origin },
      body: { name: 'Renamed Tester' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: expect.any(Number), email, name: 'Renamed Tester' });
    expect(res.json().data.preferences).toBeDefined();
  });

  test('PATCH /v1/me/preferences stores the theme', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/me/preferences',
      headers: { ...cookie(), ...origin },
      body: { theme: 'dark' },
    });
    expect(res.json().data.preferences.theme).toBe('dark');
  });
});

describe('the Origin check on mutations', () => {
  test('a mutation from an unrecognised origin is refused', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { ...cookie(), origin: 'https://evil.example' },
      body: { name: 'Taken Over' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('auth.origin_mismatch');
  });

  test('a read is unaffected', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { ...cookie(), origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /v1/me/sessions', () => {
  test('lists the caller session, marks it current, and paginates', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/sessions', headers: cookie() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.pagination).toMatchObject({ offset: 0, has_more: false });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ current: true, user_agent: 'Bun/test', current_organization_slug: null });
  });

  test('sign out everywhere keeps the caller signed in', async () => {
    await app.inject({ method: 'POST', url: '/v1/auth/sign-in', headers: origin, body: { email, password } });
    const before = await app.inject({ method: 'GET', url: '/v1/me/sessions', headers: cookie() });
    expect(before.json().data.length).toBe(2);

    const res = await app.inject({ method: 'DELETE', url: '/v1/me/sessions', headers: { ...cookie(), ...origin } });
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].current).toBe(true);
  });

  test('revoking a session returns it in its final state', async () => {
    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      headers: origin,
      body: { email, password },
    });
    const otherSid = second.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;
    const list = await app.inject({ method: 'GET', url: '/v1/me/sessions', headers: cookie() });
    const other = list.json().data.find((s: { current: boolean }) => !s.current);

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/me/sessions/${other.id}`,
      headers: { ...cookie(), ...origin },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(other.id);

    const dead = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${otherSid}` },
    });
    expect(dead.statusCode).toBe(401);
  });

  test("another user's session id is 404, not 403", async () => {
    const res = await app.inject({ method: 'DELETE', url: '/v1/me/sessions/1', headers: { ...cookie(), ...origin } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('session.not_found');
  });
});

describe('personal access tokens', () => {
  let tokenId: number;
  let raw: string;

  test('POST /v1/me/tokens shows the token exactly once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/tokens',
      headers: { ...cookie(), ...origin },
      body: { name: 'MCP client', scopes: ['issues:read', 'issues:write'] },
    });

    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.token).toMatch(/^nl_pat_[A-Za-z0-9]{43}$/);
    expect(data.token_prefix.startsWith(PAT_PREFIX)).toBe(true);
    expect(data.project_keys).toBeNull();
    expect(data.last_used_at).toBeNull();
    tokenId = data.id;
    raw = data.token;
  });

  test('the list never returns the raw token again', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/tokens', headers: cookie() });
    const row = res.json().data.find((t: { id: number }) => t.id === tokenId);
    expect(row.token).toBeUndefined();
    expect(row.token_prefix.startsWith(PAT_PREFIX)).toBe(true);
  });

  test('creating one warns the account holder by email', () => {
    expect(sent.findLast(m => m.subject === 'email.pat_created.subject')?.to).toBe(email);
  });

  test('the token authenticates and is exempt from the Origin check', async () => {
    const read = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${raw}` } });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.email).toBe(email);

    const write = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${raw}` },
      body: { name: 'Renamed By Agent' },
    });
    expect(write.statusCode).toBe(200);
  });

  test('last_used_at is surfaced so a stale token is visible', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/tokens', headers: cookie() });
    expect(res.json().data.find((t: { id: number }) => t.id === tokenId).last_used_at).not.toBeNull();
  });

  test('an unknown project key is 404 and names the field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/tokens',
      headers: { ...cookie(), ...origin },
      body: { name: 'Restricted', scopes: ['issues:read'], project_keys: ['NOPE'] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: 'project.not_found', field: 'project_keys' });
  });

  test('a bearer token that is not a PAT is ignored — no JWT anywhere', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.x' },
    });
    expect(res.statusCode).toBe(401);
  });

  test('revoking returns the token in its final state and stops it working', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/me/tokens/${tokenId}`,
      headers: { ...cookie(), ...origin },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.revoked_at).not.toBeNull();

    const dead = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${raw}` } });
    expect(dead.statusCode).toBe(401);
    const twice = await app.inject({
      method: 'DELETE',
      url: `/v1/me/tokens/${tokenId}`,
      headers: { ...cookie(), ...origin },
    });
    expect(twice.statusCode).toBe(404);
  });
});

describe('current organisation', () => {
  test('an unknown slug is 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/current-organization',
      headers: { ...cookie(), ...origin },
      body: { slug: `no-such-org-${stamp}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('organization.not_found');
  });
});

describe('the whole email-change round trip over HTTP', () => {
  test('the address moves only after the new one is confirmed', async () => {
    const changed = `changed-${stamp}@test.local`;
    const request = await app.inject({
      method: 'POST',
      url: '/v1/me/email-change',
      headers: { ...cookie(), ...origin },
      body: { current_password: password, email: changed },
    });
    expect(request.statusCode).toBe(200);

    const before = await app.inject({ method: 'GET', url: '/v1/me', headers: cookie() });
    expect(before.json().data.email).toBe(email);

    const confirm = await app.inject({
      method: 'POST',
      url: '/v1/auth/email-change/confirm',
      headers: origin,
      body: { token: tokenFrom('email.email_change_verify.subject') },
    });
    expect(confirm.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/v1/me', headers: cookie() });
    expect(after.json().data.email).toBe(changed);

    // Put it back so the teardown finds the row by its original address.
    const restore = await app.inject({
      method: 'POST',
      url: '/v1/me/email-change',
      headers: { ...cookie(), ...origin },
      body: { current_password: password, email },
    });
    expect(restore.statusCode).toBe(200);
    await app.inject({
      method: 'POST',
      url: '/v1/auth/email-change/confirm',
      headers: origin,
      body: { token: tokenFrom('email.email_change_verify.subject') },
    });
  });
});

describe('sign out', () => {
  test('clears the cookie and the session stops resolving', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/sign-out', headers: { ...cookie(), ...origin } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ ok: true });
    expect(res.cookies.find(c => c.name === SESSION_COOKIE_NAME)?.value).toBe('');

    const after = await app.inject({ method: 'GET', url: '/v1/me', headers: cookie() });
    expect(after.statusCode).toBe(401);
    expect(after.cookies.find(c => c.name === SESSION_COOKIE_NAME)?.value).toBe('');
  });

  test('a request without a cookie sets none, and a bearer token leaves the cookie alone', async () => {
    const bare = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(bare.cookies.find(c => c.name === SESSION_COOKIE_NAME)).toBeUndefined();

    const pat = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { ...cookie(), authorization: `Bearer ${PAT_PREFIX}not-a-real-token` },
    });
    expect(pat.statusCode).toBe(401);
    expect(pat.cookies.find(c => c.name === SESSION_COOKIE_NAME)).toBeUndefined();
  });
});
