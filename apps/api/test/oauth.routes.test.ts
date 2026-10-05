import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  createDb,
  oneTimeTokensRepository,
  personalAccessTokensRepository,
  systemContext,
  usersRepository,
} from '@nothingleft/db';
import { SESSION_COOKIE_NAME } from '@nothingleft/types';
import { OAUTH_STATE_COOKIE_NAME } from '@config/constants';
import { issueOneTimeToken, issuePat } from '@lib/crypto';
import type { OAuthClient, ProviderProfile } from '@lib/oauth';
import { testApp, testEnv } from './helpers.ts';

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const origin = { origin: testEnv.APP_BASE_URL };

let next: ProviderProfile;
const google: OAuthClient = {
  authorizeUrl: ({ state, codeChallenge }) => `https://accounts.google.test/auth?state=${state}&cc=${codeChallenge}`,
  exchange: async () => next,
};

let app: Awaited<ReturnType<typeof testApp>>;
const { db, pool } = createDb(testEnv.DATABASE_URL, { max: 2, allowExitOnIdle: true });

beforeAll(async () => {
  app = await testApp({ oauthClients: { google } });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function start() {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/oauth/google/start', headers: origin });
  const cookie = res.cookies.find(c => c.name === OAUTH_STATE_COOKIE_NAME)!;
  return { res, state: cookie.value, cookie };
}

const callback = (state: string, bound: string | null, body: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: '/v1/auth/oauth/google/callback',
    headers: { ...origin, ...(bound ? { cookie: `${OAUTH_STATE_COOKIE_NAME}=${bound}` } : {}) },
    body: { code: 'provider-code', state, ...body },
  });

describe('POST /v1/auth/oauth/:provider/start', () => {
  test('answers the authorize URL and binds its state to an httpOnly cookie', async () => {
    const { res, state, cookie } = await start();

    expect(res.statusCode).toBe(200);
    expect(new URL(res.json().data.authorize_url).searchParams.get('state')).toBe(state);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/v1/auth/oauth', maxAge: 600 });
  });

  test('an unconfigured provider is a 503 with the catalogue code', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/oauth/github/start', headers: origin });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('auth.oauth_not_configured');
  });

  test('an unknown provider fails validation', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/oauth/gitlab/start', headers: origin });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /v1/auth/oauth/:provider/callback', () => {
  const email = `oauth-${stamp}@test.local`;

  test('a first sign-in creates the account (201), sets the session and clears the state cookie', async () => {
    next = {
      provider: 'google',
      provider_id: `g-${stamp}`,
      email,
      email_verified: true,
      name: 'OAuth Route',
      avatar_url: 'https://lh3.googleusercontent.com/a/route',
    };
    const { state } = await start();
    const res = await callback(state, state, { timezone: 'Asia/Kolkata' });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.notice).toBeNull();
    expect(res.json().data.me).toMatchObject({
      email,
      name: 'OAuth Route',
      timezone: 'Asia/Kolkata',
      avatar_url: 'https://lh3.googleusercontent.com/a/route',
    });
    expect(res.json().data.me).toMatchObject({ has_password: false, linked_providers: ['google'] });
    expect(typeof res.json().data.me.email_verified_at).toBe('string');
    expect(res.cookies.find(c => c.name === SESSION_COOKIE_NAME)?.httpOnly).toBe(true);
    expect(res.cookies.find(c => c.name === OAUTH_STATE_COOKIE_NAME)?.value).toBe('');
  });

  test('a returning sign-in is a 200 for the same account', async () => {
    const { state } = await start();
    const res = await callback(state, state);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.me.email).toBe(email);

    const sid = res.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie: `${SESSION_COOKIE_NAME}=${sid}` } });
    expect(me.json().data.email).toBe(email);
  });

  test('linking to an unconfirmed password account says so once, with the account date', async () => {
    const squatted = `squatted-${stamp}@test.local`;
    const signUp = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      headers: origin,
      body: { email: squatted, password: 'a-long-enough-password', name: 'Squatter' },
    });
    expect(signUp.statusCode).toBe(201);

    next = { ...next, provider_id: `g-squatted-${stamp}`, email: squatted, email_verified: true };
    const { state } = await start();
    const res = await callback(state, state);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.me).toMatchObject({ email: squatted, has_password: false });
    expect(res.json().data.notice).toMatchObject({ kind: 'unverified_account_linked' });
    expect(Number.isNaN(Date.parse(res.json().data.notice.account_created_at))).toBe(false);

    const again = await start();
    expect((await callback(again.state, again.state)).json().data.notice).toBeNull();
  });

  test('recovering an unverified account revokes the token, session and email change it held', async () => {
    const squatted = `held-${stamp}@test.local`;
    const signUp = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      headers: origin,
      body: { email: squatted, password: 'a-long-enough-password', name: 'Squatter' },
    });
    const squatterSid = signUp.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;

    const sys = systemContext('test: credentials an unverified account held before the refusal existed');
    const squatter = (await usersRepository(db).findByEmail(sys, squatted))!;
    const pat = issuePat();
    await personalAccessTokensRepository(db).create(sys, {
      user_id: squatter.id,
      name: 'squatter',
      token_hash: pat.token_hash,
      token_prefix: pat.token_prefix,
      scopes: ['issues:read'],
    });
    const change = issueOneTimeToken();
    await oneTimeTokensRepository(db).create(sys, {
      user_id: squatter.id,
      purpose: 'email_change',
      token_hash: change.token_hash,
      new_email: `elsewhere-${stamp}@test.local`,
      expires_at: new Date(Date.now() + 86_400_000),
    });
    const asPat = { authorization: `Bearer ${pat.token}` };
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: asPat })).statusCode).toBe(200);

    next = { ...next, provider_id: `g-held-${stamp}`, email: squatted, email_verified: true };
    const { state } = await start();
    expect((await callback(state, state)).json().data.notice).toMatchObject({ kind: 'unverified_account_linked' });

    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: asPat })).statusCode).toBe(401);
    const oldSession = { cookie: `${SESSION_COOKIE_NAME}=${squatterSid}` };
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: oldSession })).statusCode).toBe(401);
    const confirm = await app.inject({
      method: 'POST',
      url: '/v1/auth/email-change/confirm',
      headers: origin,
      body: { token: change.token },
    });
    expect(confirm.json().error.code).toBe('auth.invalid_token');
  });

  test('a callback without the state cookie is refused', async () => {
    const { state } = await start();
    const res = await callback(state, null);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('auth.oauth_state_invalid');
  });

  test('a state is single-use', async () => {
    const { state } = await start();
    expect((await callback(state, state)).statusCode).toBe(200);
    expect((await callback(state, state)).json().error.code).toBe('auth.oauth_state_invalid');
  });

  test('an unverified provider address is a 403 and creates nothing', async () => {
    next = {
      ...next,
      provider_id: `g-unverified-${stamp}`,
      email: `unverified-${stamp}@test.local`,
      email_verified: false,
    };
    const { state } = await start();
    const res = await callback(state, state);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('auth.oauth_email_unverified');
    expect(res.cookies.find(c => c.name === SESSION_COOKIE_NAME)).toBeUndefined();
  });
});
