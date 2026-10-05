import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { systemContext, totpRecoveryCodesRepository, usersRepository, createDb } from '@nothingleft/db';
import { SESSION_COOKIE_NAME } from '@nothingleft/types';
import { TWO_FACTOR_CHALLENGE_COOKIE_NAME } from '@config/constants';
import type { OAuthClient, ProviderProfile } from '@lib/oauth';
import { totpCode } from '@lib/totp';
import { testApp, testEnv } from './helpers.ts';
import { mailbox, origin, password, signUp, type Person } from './people.ts';

const STEP = 30_000;
let clock = Date.now();
const box = mailbox();
let next: ProviderProfile;
const google: OAuthClient = { authorizeUrl: () => 'https://accounts.google.test/auth', exchange: async () => next };
let app: Awaited<ReturnType<typeof testApp>>;
const { db, pool } = createDb(testEnv.DATABASE_URL, { max: 2, allowExitOnIdle: true });

/** Each call is the authenticator a step later, so no two codes share a time step. */
const tick = () => {
  clock += STEP;
  return new Date(clock);
};

const call = (who: Person | null, method: 'GET' | 'POST', url: string, body?: object, headers = {}) =>
  app.inject({ method, url, headers: { ...(who?.headers ?? origin), ...headers }, ...(body ? { body } : {}) });

async function enable(who: Person): Promise<{ secret: string; codes: string[] }> {
  const setup = await call(who, 'POST', '/v1/me/two-factor/setup');
  expect(setup.statusCode).toBe(200);
  const { secret } = setup.json().data;
  const confirmed = await call(who, 'POST', '/v1/me/two-factor/confirm', {
    code: totpCode(secret, tick()),
    current_password: password,
  });
  expect(confirmed.statusCode).toBe(200);
  return { secret, codes: confirmed.json().data.recovery_codes };
}

async function passwordStep(email: string) {
  const res = await call(null, 'POST', '/v1/auth/sign-in', { email, password });
  const challenge = res.cookies.find(c => c.name === TWO_FACTOR_CHALLENGE_COOKIE_NAME);
  return { res, cookie: challenge ? `${TWO_FACTOR_CHALLENGE_COOKIE_NAME}=${challenge.value}` : '' };
}

const codeStep = (cookie: string, body: object) =>
  app.inject({ method: 'POST', url: '/v1/auth/two-factor', headers: { ...origin, cookie }, body });

beforeAll(async () => {
  app = await testApp({ mailer: box.mailer, oauthClients: { google }, now: () => new Date(clock) });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('two-factor setup', () => {
  test('stays off until a code from the new secret is confirmed, and the secret is sealed at rest', async () => {
    const who = await signUp(app, box, 'Alex');
    const setup = (await call(who, 'POST', '/v1/me/two-factor/setup')).json().data;
    expect(setup.otpauth_uri).toStartWith('otpauth://totp/Nothing%20Left:');
    expect(setup.otpauth_uri).toContain(`secret=${setup.secret}`);
    expect((await call(who, 'GET', '/v1/me')).json().data.two_factor.enabled).toBe(false);

    const wrong = await call(who, 'POST', '/v1/me/two-factor/confirm', { code: '000000', current_password: password });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('two_factor.invalid_code');

    const row = await usersRepository(db).findByEmail(systemContext('test'), who.email);
    expect(row!.totp_secret_ciphertext).toStartWith('v1.');
    expect(row!.totp_secret_ciphertext).not.toContain(setup.secret);

    const confirmed = await call(who, 'POST', '/v1/me/two-factor/confirm', {
      code: totpCode(setup.secret, tick()),
      current_password: password,
    });
    expect(confirmed.json().data.recovery_codes).toHaveLength(10);
    expect(box.last(who.email)?.subject).toBe('email.two_factor_enabled.subject');

    const me = (await call(who, 'GET', '/v1/me')).json().data;
    expect(me.two_factor).toMatchObject({ enabled: true, recovery_codes_remaining: 10 });
    expect(JSON.stringify(me)).not.toContain(setup.secret);
    expect((await call(who, 'POST', '/v1/me/two-factor/setup')).json().error.code).toBe('two_factor.already_enabled');
  });

  test('an access token cannot reach any of it', async () => {
    const who = await signUp(app, box, 'Casey');
    const token = (await call(who, 'POST', '/v1/me/tokens', { name: 'agent', scopes: ['issues:read'] })).json().data
      .token;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/two-factor/setup',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('auth.session_required');
  });
});

describe('signing in with two-factor on', () => {
  let who: Person;
  let secret: string;
  let codes: string[];

  beforeAll(async () => {
    who = await signUp(app, box, 'Jordan');
    ({ secret, codes } = await enable(who));
  });

  test('the password step answers 202 with no session, and the code step signs in', async () => {
    const { res, cookie } = await passwordStep(who.email);
    expect(res.statusCode).toBe(202);
    expect(res.json().data.two_factor_required).toBe(true);
    expect(res.cookies.find(c => c.name === SESSION_COOKIE_NAME)).toBeUndefined();
    const challenge = res.cookies.find(c => c.name === TWO_FACTOR_CHALLENGE_COOKIE_NAME)!;
    expect(challenge).toMatchObject({ httpOnly: true, path: '/v1/auth/two-factor' });

    const code = totpCode(secret, tick());
    const signedIn = await codeStep(cookie, { code });
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.cookies.find(c => c.name === SESSION_COOKIE_NAME)?.value).toBeTruthy();

    // The same code, inside its own 30 seconds, is a replay.
    const again = await passwordStep(who.email);
    expect((await codeStep(again.cookie, { code })).json().error.code).toBe('two_factor.invalid_code');
  });

  test('the code step without a password step, or after one is spent, is refused', async () => {
    expect((await codeStep('', { code: '123456' })).json().error.code).toBe('two_factor.challenge_expired');
    const { cookie } = await passwordStep(who.email);
    await codeStep(cookie, { code: totpCode(secret, tick()) });
    expect((await codeStep(cookie, { code: totpCode(secret, tick()) })).json().error.code).toBe(
      'two_factor.challenge_expired',
    );
  });

  test('a recovery code signs in once, and its use is emailed with the count left', async () => {
    const { cookie } = await passwordStep(who.email);
    const res = await codeStep(cookie, { recovery_code: codes[0]!.toUpperCase() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.two_factor.recovery_codes_remaining).toBe(9);
    const mail = box.last(who.email)!;
    expect(mail.subject).toBe('email.recovery_code_used.subject');
    expect(mail.params?.['remaining']).toBe(9);

    const again = await passwordStep(who.email);
    expect((await codeStep(again.cookie, { recovery_code: codes[0]! })).statusCode).toBe(401);
  });

  test('five wrong codes end the challenge and pause the account’s codes', async () => {
    const fresh = await signUp(app, box, 'Quinn');
    const { secret: own } = await enable(fresh);
    const { cookie } = await passwordStep(fresh.email);
    for (let i = 0; i < 5; i++) expect((await codeStep(cookie, { code: '000000' })).statusCode).toBe(401);
    expect((await codeStep(cookie, { code: totpCode(own, tick()) })).json().error.code).toBe(
      'two_factor.challenge_expired',
    );
    // The pause is announced at the password step, before anyone types a code.
    const locked = await passwordStep(fresh.email);
    expect(locked.res.statusCode).toBe(429);
    expect(locked.res.json().error.code).toBe('auth.account_locked');
    expect(locked.cookie).toBe('');
  });
});

describe('Google and GitHub sign-in skip the second factor', () => {
  test('a provider sign-in to an account with two-factor on gets a session at once', async () => {
    const who = await signUp(app, box, 'Sam');
    await enable(who);
    next = {
      provider: 'google',
      provider_id: `g-${crypto.randomUUID()}`,
      email: who.email,
      email_verified: true,
      name: 'Sam',
      avatar_url: null,
    };
    const start = await app.inject({ method: 'POST', url: '/v1/auth/oauth/google/start', headers: origin });
    const state = start.cookies.find(c => c.name === 'oauth_state')!.value;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/google/callback',
      headers: { ...origin, cookie: `oauth_state=${state}` },
      body: { code: 'provider-code', state },
    });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.find(c => c.name === SESSION_COOKIE_NAME)?.value).toBeTruthy();
    expect(res.cookies.find(c => c.name === TWO_FACTOR_CHALLENGE_COOKIE_NAME)).toBeUndefined();
  });
});

describe('a provider recovering an unverified account', () => {
  const sys = systemContext('test: two-factor an unverified account set up');

  async function recover(email: string) {
    next = {
      provider: 'google',
      provider_id: `g-${crypto.randomUUID()}`,
      email,
      email_verified: true,
      name: 'Owner',
      avatar_url: null,
    };
    const start = await app.inject({ method: 'POST', url: '/v1/auth/oauth/google/start', headers: origin });
    const state = start.cookies.find(c => c.name === 'oauth_state')!.value;
    return app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/google/callback',
      headers: { ...origin, cookie: `oauth_state=${state}` },
      body: { code: 'provider-code', state },
    });
  }

  test('turns off the two-factor the account set up, and a pending second step cannot finish', async () => {
    const squatter = await signUp(app, box, 'Squatter', { verify: false });
    const { secret } = await enable(squatter);
    const { cookie } = await passwordStep(squatter.email);

    const recovered = await recover(squatter.email);
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json().data.me.two_factor).toMatchObject({ enabled: false, recovery_codes_remaining: 0 });

    const finish = await codeStep(cookie, { code: totpCode(secret, tick()) });
    expect(finish.statusCode).toBe(401);
    expect(finish.json().error.code).toBe('two_factor.challenge_expired');

    const row = (await usersRepository(db).findByEmail(sys, squatter.email))!;
    expect(row).toMatchObject({ totp_secret_ciphertext: null, totp_enabled_at: null, totp_last_used_step: null });
    expect(await totpRecoveryCodesRepository(db).countUnused(sys, row.id)).toBe(0);
  });

  test('a pending second step cannot finish once the account has no password', async () => {
    const who = await signUp(app, box, 'Riley');
    const { secret } = await enable(who);
    const { cookie } = await passwordStep(who.email);
    const row = (await usersRepository(db).findByEmail(sys, who.email))!;
    await usersRepository(db).update(sys, row.id, { password_hash: null });

    const finish = await codeStep(cookie, { code: totpCode(secret, tick()) });
    expect(finish.statusCode).toBe(401);
    expect(finish.json().error.code).toBe('two_factor.challenge_expired');
  });
});

describe('disabling and new recovery codes', () => {
  test('disabling needs the password and a code; either alone is refused', async () => {
    const who = await signUp(app, box, 'Riley');
    const { secret } = await enable(who);

    const noCode = await call(who, 'POST', '/v1/me/two-factor/disable', { current_password: password });
    expect(noCode.json().error.code).toBe('two_factor.code_required');
    const noPassword = await call(who, 'POST', '/v1/me/two-factor/disable', { code: totpCode(secret, tick()) });
    expect(noPassword.json().error.code).toBe('auth.password_required');
    const wrong = await call(who, 'POST', '/v1/me/two-factor/disable', {
      current_password: 'not-the-password',
      code: totpCode(secret, tick()),
    });
    expect(wrong.json().error.code).toBe('auth.wrong_password');

    const off = await call(who, 'POST', '/v1/me/two-factor/disable', {
      current_password: password,
      code: totpCode(secret, tick()),
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().data.two_factor.enabled).toBe(false);
    expect(box.last(who.email)?.subject).toBe('email.two_factor_disabled.subject');
    expect((await passwordStep(who.email)).res.statusCode).toBe(200);
  });

  test('new recovery codes replace the old ones', async () => {
    const who = await signUp(app, box, 'Morgan');
    const { secret, codes } = await enable(who);
    const res = await call(who, 'POST', '/v1/me/two-factor/recovery-codes', {
      current_password: password,
      code: totpCode(secret, tick()),
    });
    const fresh = res.json().data.recovery_codes as string[];
    expect(fresh).toHaveLength(10);
    expect(fresh).not.toContain(codes[1]);
    expect(box.last(who.email)?.subject).toBe('email.recovery_codes_regenerated.subject');

    const { cookie } = await passwordStep(who.email);
    expect((await codeStep(cookie, { recovery_code: codes[1]! })).statusCode).toBe(401);
    expect((await codeStep(cookie, { recovery_code: fresh[1]! })).statusCode).toBe(200);
  });

  test('an account without a password has no password sign-in to guard', async () => {
    next = {
      provider: 'google',
      provider_id: `g-${crypto.randomUUID()}`,
      email: `oauth-only-${crypto.randomUUID()}@test.local`,
      email_verified: true,
      name: 'Taylor',
      avatar_url: null,
    };
    const start = await app.inject({ method: 'POST', url: '/v1/auth/oauth/google/start', headers: origin });
    const state = start.cookies.find(c => c.name === 'oauth_state')!.value;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/google/callback',
      headers: { ...origin, cookie: `oauth_state=${state}` },
      body: { code: 'provider-code', state },
    });
    const sid = res.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;
    const setup = await app.inject({
      method: 'POST',
      url: '/v1/me/two-factor/setup',
      headers: { ...origin, cookie: `${SESSION_COOKIE_NAME}=${sid}` },
    });
    expect(setup.json().error.code).toBe('auth.no_password_set');
  });
});
