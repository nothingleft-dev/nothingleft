import { beforeEach, describe, expect, test } from 'bun:test';
import { SIGN_IN_MAX_ATTEMPTS } from '@nothingleft/types';
import { systemContext } from '@nothingleft/db';
import { issueOneTimeToken, issuePat } from '@lib/crypto';
import { accountsService, type AccountsService } from '@services/accounts.service';
import { stubWorld } from './stubs.ts';

const facts = { ip: '203.0.113.9', user_agent: 'Bun/test', country_code: 'IN' };
const credentials = { email: 'jordan@test.local', password: 'a-long-enough-password' };
const signUp = { ...credentials, name: 'Jordan Rivera' };

let world: ReturnType<typeof stubWorld>;
let accounts: AccountsService;

beforeEach(() => {
  world = stubWorld();
  accounts = accountsService(world.deps);
});

const principalFor = (userId: number, sessionId: number) =>
  ({ via: 'session', userId, sessionId, currentOrgId: null }) as const;

async function signUpVerified(service: AccountsService = accounts) {
  const result = await service.signUp(signUp, facts, 'UTC');
  await service.verifyEmail(world.tokenFromLastEmail());
  return result;
}

const sys = systemContext('test: credentials an account held before it was verified');

async function seedCredentials(userId: number) {
  const pat = issuePat();
  await world.repos.tokens.create(sys, {
    user_id: userId,
    name: 'held',
    token_hash: pat.token_hash,
    token_prefix: pat.token_prefix,
    scopes: ['issues:read'],
  });
  const change = issueOneTimeToken();
  await world.repos.oneTimeTokens.create(sys, {
    user_id: userId,
    purpose: 'email_change',
    token_hash: change.token_hash,
    new_email: 'elsewhere@test.local',
    expires_at: new Date(Date.now() + 86_400_000),
  });
  return { changeToken: change.token };
}

describe('signUp', () => {
  test('an email invitation to this address creates the account verified and sends no verification', async () => {
    accounts = accountsService({
      ...world.deps,
      invitationProvesEmail: async (token, email) => token === 'inv' && email === credentials.email,
    });
    const { user } = await accounts.signUp({ ...signUp, invitation_token: 'inv' }, facts, 'UTC');
    expect(user.email_verified_at).not.toBeNull();
    expect(world.state.sent).toEqual([]);
  });

  test('any other invitation token still verifies, then returns to the invitation', async () => {
    const { user } = await accounts.signUp({ ...signUp, invitation_token: 'link-token' }, facts, 'UTC');
    expect(user.email_verified_at ?? null).toBeNull();
    expect(String(world.state.sent[0]?.params?.['url'])).toContain('next=%2Finvite%2Flink-token');
  });

  test('creates the account, its preferences row and a session', async () => {
    const { token, user } = await accounts.signUp(signUp, facts, 'Asia/Kolkata');

    expect(token.length).toBeGreaterThan(20);
    expect(user.email).toBe(credentials.email);
    expect(user.timezone).toBe('Asia/Kolkata');
    expect(user.password_hash?.startsWith('$argon2id$')).toBe(true);
    expect(world.state.preferences).toHaveLength(1);
    expect(world.state.sessions).toHaveLength(1);
  });

  test('a rejected verification email still signs the new account in, and is reported', async () => {
    const reported: unknown[] = [];
    accounts = accountsService({
      ...world.deps,
      mailer: {
        async send() {
          throw new Error('resend 422: invalid recipient');
        },
      },
      analytics: { ...world.deps.analytics, captureException: err => reported.push(err) },
    });
    const { token, user } = await accounts.signUp(signUp, facts, 'UTC');
    expect(token.length).toBeGreaterThan(20);
    expect(user.email_verified_at ?? null).toBeNull();
    expect(world.state.sessions).toHaveLength(1);
    expect(reported).toHaveLength(1);
  });

  test('resolves the avatar chain at write time so no render probes Gravatar', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    expect(user.avatar_url).toContain('dicebear.com');
  });

  test('records the sign-up country and login facts', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    expect(user.country_code).toBe('IN');
    expect(user.last_login_ip).toBe(facts.ip);
    expect(user.last_login_at).not.toBeNull();
  });

  test('sends the verification email and leaves the account unverified', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    expect(user.email_verified_at).toBeNull();
    expect(world.state.sent.at(-1)).toMatchObject({ to: credentials.email, subject: 'email.verify.subject' });
  });

  test('refuses a duplicate address', async () => {
    await accounts.signUp(signUp, facts, 'UTC');
    expect(accounts.signUp(signUp, facts, 'UTC')).rejects.toThrow('An account already uses that email address.');
  });

  test('refuses a breached password before anything is written', async () => {
    world.deps.isPasswordBreached = async () => true;
    accounts = accountsService(world.deps);
    expect(accounts.signUp(signUp, facts, 'UTC')).rejects.toThrow('public breach list');
    expect(world.state.users).toHaveLength(0);
  });
});

describe('signIn', () => {
  beforeEach(async () => {
    await accounts.signUp(signUp, facts, 'UTC');
  });

  test('issues a second session for the same account', async () => {
    const session = await accounts.signIn(credentials, facts);
    expect('token' in session && session.token.length).toBeGreaterThan(20);
    expect(world.state.sessions).toHaveLength(2);
  });

  test('rejects a wrong password with the same message as an unknown address', async () => {
    const wrong = accounts.signIn({ ...credentials, password: 'not-the-password' }, facts);
    expect(wrong).rejects.toThrow('That email or password is incorrect.');
    const unknown = accounts.signIn({ email: 'nobody@test.local', password: 'whatever-long' }, facts);
    expect(unknown).rejects.toThrow('That email or password is incorrect.');
  });

  test('locks sign-in after five failures and clears the counter on success', async () => {
    for (let i = 0; i < SIGN_IN_MAX_ATTEMPTS; i++) {
      await accounts.signIn({ ...credentials, password: 'wrong-but-long-enough' }, facts).catch(() => {});
    }
    expect(accounts.signIn(credentials, facts)).rejects.toThrow('Sign-in is paused for 15 minutes.');
  });

  test('a successful sign-in resets the failure counter', async () => {
    await accounts.signIn({ ...credentials, password: 'wrong-but-long-enough' }, facts).catch(() => {});
    await accounts.signIn(credentials, facts);
    expect(world.state.counters.size).toBe(0);
  });

  test('adopts a timezone the browser reports', async () => {
    await accounts.signIn({ ...credentials, timezone: 'Europe/Berlin' }, facts);
    expect(world.state.users[0]?.timezone).toBe('Europe/Berlin');
  });

  test('refuses a deactivated account', async () => {
    world.state.users[0]!.deactivated_at = new Date();
    expect(accounts.signIn(credentials, facts)).rejects.toThrow('deactivated');
  });
});

describe('email verification', () => {
  test('a token verifies the address exactly once', async () => {
    await accounts.signUp(signUp, facts, 'UTC');
    const token = world.tokenFromLastEmail();

    expect(await accounts.verifyEmail(token)).toEqual({ ok: true });
    expect(world.state.users[0]?.email_verified_at).not.toBeNull();
    expect(accounts.verifyEmail(token)).rejects.toThrow('That link is not valid.');
  });

  test('an expired token is refused with its own code', async () => {
    await accounts.signUp(signUp, facts, 'UTC');
    const token = world.tokenFromLastEmail();
    world.state.oneTimeTokens[0]!.expires_at = new Date(Date.now() - 1000);
    expect(accounts.verifyEmail(token)).rejects.toThrow('That link has expired.');
  });

  test('resending is a no-op once the address is verified', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    await accounts.verifyEmail(world.tokenFromLastEmail());
    const before = world.state.sent.length;

    await accounts.resendVerification(principalFor(user.id, 1));
    expect(world.state.sent).toHaveLength(before);
  });
});

describe('password reset', () => {
  test('acknowledges an unknown address without disclosing anything', async () => {
    expect(await accounts.requestPasswordReset('nobody@test.local')).toEqual({ ok: true });
    expect(world.state.sent).toHaveLength(0);
  });

  test('signs every session out on success and confirms by email', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    await accounts.signIn(credentials, facts);
    await accounts.requestPasswordReset(credentials.email);
    const token = world.tokenFromLastEmail();

    await accounts.resetPassword(token, 'a-brand-new-password');

    expect(world.state.sessions).toHaveLength(0);
    expect(world.state.invalidated.length).toBeGreaterThan(0);
    expect(world.state.sent.at(-1)?.subject).toBe('email.password_changed.subject');
    await accounts.signIn({ email: credentials.email, password: 'a-brand-new-password' }, facts);
    expect(world.state.users[0]?.id).toBe(user.id);
  });

  test('the token is single-use', async () => {
    await accounts.signUp(signUp, facts, 'UTC');
    await accounts.requestPasswordReset(credentials.email);
    const token = world.tokenFromLastEmail();
    await accounts.resetPassword(token, 'a-brand-new-password');
    expect(accounts.resetPassword(token, 'another-new-password')).rejects.toThrow('That link is not valid.');
  });

  test('a breached replacement is refused', async () => {
    await accounts.signUp(signUp, facts, 'UTC');
    await accounts.requestPasswordReset(credentials.email);
    const token = world.tokenFromLastEmail();
    world.deps.isPasswordBreached = async () => true;
    accounts = accountsService(world.deps);
    expect(accounts.resetPassword(token, 'password1234')).rejects.toThrow('public breach list');
  });

  test('completing one reset link invalidates the others', async () => {
    await accounts.signUp(signUp, facts, 'UTC');
    await accounts.requestPasswordReset(credentials.email);
    const older = world.tokenFromLastEmail();
    await accounts.requestPasswordReset(credentials.email);
    const newer = world.tokenFromLastEmail();

    await accounts.resetPassword(newer, 'a-brand-new-password');

    await expect(accounts.resetPassword(older, 'an-attackers-password')).rejects.toMatchObject({
      code: 'auth.invalid_token',
      status: 400,
    });
    await accounts.signIn({ email: credentials.email, password: 'a-brand-new-password' }, facts);
  });

  test('a reset requested after a completed one still works', async () => {
    await accounts.signUp(signUp, facts, 'UTC');
    await accounts.requestPasswordReset(credentials.email);
    await accounts.resetPassword(world.tokenFromLastEmail(), 'a-brand-new-password');

    await accounts.requestPasswordReset(credentials.email);
    await accounts.resetPassword(world.tokenFromLastEmail(), 'a-third-long-password');
    await accounts.signIn({ email: credentials.email, password: 'a-third-long-password' }, facts);
  });
});

describe('changePassword', () => {
  test('keeps the caller signed in and revokes every other session', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    await accounts.signIn(credentials, facts);
    const mine = world.state.sessions[0]!.id;

    await accounts.changePassword(principalFor(user.id, mine), {
      current_password: credentials.password,
      password: 'a-different-long-password',
    });

    expect(world.state.sessions.map(s => s.id)).toEqual([mine]);
    expect(world.state.sent.at(-1)?.subject).toBe('email.password_changed.subject');
  });

  test('requires the current password', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    const attempt = accounts.changePassword(principalFor(user.id, 1), {
      current_password: 'not-the-password',
      password: 'a-different-long-password',
    });
    expect(attempt).rejects.toThrow('That password is incorrect.');
  });

  test('an OAuth-only account has no password to change', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    world.state.users[0]!.password_hash = null;
    const attempt = accounts.changePassword(principalFor(user.id, 1), {
      current_password: credentials.password,
      password: 'a-different-long-password',
    });
    expect(attempt).rejects.toThrow('signs in with Google or GitHub');
  });

  test('changing the password invalidates pending reset links', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    await accounts.requestPasswordReset(credentials.email);
    const pending = world.tokenFromLastEmail();

    await accounts.changePassword(principalFor(user.id, world.state.sessions[0]!.id), {
      current_password: credentials.password,
      password: 'a-different-long-password',
    });

    await expect(accounts.resetPassword(pending, 'an-attackers-password')).rejects.toMatchObject({
      code: 'auth.invalid_token',
    });
  });

  test('changing the password leaves a pending email change alone', async () => {
    const { user } = await signUpVerified();
    await accounts.requestEmailChange(principalFor(user.id, world.state.sessions[0]!.id), {
      current_password: credentials.password,
      email: 'jordan.rivera@test.local',
    });
    const change = world.tokenFromLastEmail();

    await accounts.changePassword(principalFor(user.id, world.state.sessions[0]!.id), {
      current_password: credentials.password,
      password: 'a-different-long-password',
    });

    await accounts.confirmEmailChange(change);
    expect(world.state.users[0]!.email).toBe('jordan.rivera@test.local');
  });
});

describe('email change', () => {
  test('re-verification is required, and the address moves only on confirmation', async () => {
    const { user } = await signUpVerified();
    await accounts.requestEmailChange(principalFor(user.id, 1), {
      current_password: credentials.password,
      email: 'jordan.rivera@test.local',
    });

    expect(world.state.sent.at(-1)).toMatchObject({
      to: 'jordan.rivera@test.local',
      subject: 'email.email_change_verify.subject',
    });
    expect(world.state.users[0]?.email).toBe(credentials.email);

    await accounts.confirmEmailChange(world.tokenFromLastEmail());
    expect(world.state.users[0]?.email).toBe('jordan.rivera@test.local');
    expect(world.state.users[0]?.email_verified_at).not.toBeNull();
  });

  test('both the old and the new address are told', async () => {
    const { user } = await signUpVerified();
    await accounts.requestEmailChange(principalFor(user.id, 1), {
      current_password: credentials.password,
      email: 'jordan.rivera@test.local',
    });
    await accounts.confirmEmailChange(world.tokenFromLastEmail());

    const notified = world.state.sent.filter(m => m.subject === 'email.email_changed.subject').map(m => m.to);
    expect(notified).toEqual([credentials.email, 'jordan.rivera@test.local']);
  });

  test('an address already in use is refused', async () => {
    const { user } = await signUpVerified();
    await accounts.signUp({ email: 'taken@test.local', password: credentials.password, name: 'Other' }, facts, 'UTC');

    const attempt = accounts.requestEmailChange(principalFor(user.id, 1), {
      current_password: credentials.password,
      email: 'taken@test.local',
    });
    expect(attempt).rejects.toThrow('An account already uses that email address.');
  });

  test('an unverified account cannot start one', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    const attempt = accounts.requestEmailChange(principalFor(user.id, 1), {
      current_password: credentials.password,
      email: 'jordan.rivera@test.local',
    });
    await expect(attempt).rejects.toMatchObject({ code: 'auth.email_unverified', status: 403 });
    expect(world.state.oneTimeTokens.some(t => t.purpose === 'email_change')).toBe(false);
  });
});

describe('signOut', () => {
  test('drops the caller session and its cache entry', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    const mine = world.state.sessions[0]!.id;

    expect(await accounts.signOut(principalFor(user.id, mine))).toEqual({ ok: true });
    expect(world.state.sessions).toHaveLength(0);
    expect(world.state.invalidated).toContain(mine);
  });

  test('is a no-op for a PAT, which holds no session', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    const pat = { via: 'pat', userId: user.id, tokenId: 1, scopes: [], projectIds: null } as const;
    expect(await accounts.signOut(pat)).toEqual({ ok: true });
    expect(world.state.sessions).toHaveLength(1);
  });
});

describe('signInWithProvider', () => {
  const google = {
    provider: 'google',
    provider_id: 'g-1001',
    email: 'jordan@test.local',
    email_verified: true,
    name: 'Jordan Rivera',
    avatar_url: 'https://lh3.googleusercontent.com/a/jordan',
  } as const;
  const tz = { device: 'Asia/Kolkata', fallback: 'Europe/London' };

  test('creates a verified account carrying the provider id, name and avatar', async () => {
    const { user, created, token } = await accounts.signInWithProvider(google, facts, tz);

    expect(created).toBe(true);
    expect(token.length).toBeGreaterThan(20);
    expect(user).toMatchObject({
      email: google.email,
      name: 'Jordan Rivera',
      google_id: 'g-1001',
      github_id: null,
      password_hash: null,
      avatar_url: google.avatar_url,
      timezone: 'Asia/Kolkata',
      country_code: 'IN',
      last_login_ip: facts.ip,
    });
    expect(user.email_verified_at).not.toBeNull();
    expect(world.state.preferences).toHaveLength(1);
    expect(world.state.sent).toHaveLength(0);
  });

  test('falls back to the edge timezone and the email local-part when the provider gives neither', async () => {
    const { user } = await accounts.signInWithProvider({ ...google, name: null, avatar_url: null }, facts, {
      fallback: 'Europe/London',
    });
    expect(user.name).toBe('jordan');
    expect(user.timezone).toBe('Europe/London');
    expect(user.avatar_url).toContain('dicebear.com');
  });

  test('refuses an address the provider has not verified, before anything is written', async () => {
    await accounts.signUp(signUp, facts, 'UTC');
    const attempt = accounts.signInWithProvider({ ...google, email_verified: false }, facts, tz);
    await expect(attempt).rejects.toThrow('has not verified that email address');
    expect(world.state.users[0]!.google_id).toBeNull();
    expect(world.state.users).toHaveLength(1);
  });

  test('matches on the provider id even after the provider email changed', async () => {
    const first = await accounts.signInWithProvider(google, facts, tz);
    const again = await accounts.signInWithProvider({ ...google, email: 'jordan.new@test.local' }, facts, tz);

    expect(again.created).toBe(false);
    expect(again.user.id).toBe(first.user.id);
    expect(world.state.users).toHaveLength(1);
  });

  test('links to an existing verified account by email and keeps its password', async () => {
    const { user } = await accounts.signUp(signUp, facts, 'UTC');
    await accounts.verifyEmail(world.tokenFromLastEmail());
    const hash = user.password_hash;

    const linked = await accounts.signInWithProvider(google, facts, tz);
    expect(linked.created).toBe(false);
    expect(linked.user).toMatchObject({ id: user.id, google_id: 'g-1001', password_hash: hash });
    expect(linked.linked_unverified_account).toBe(false);
    expect(world.state.sent.at(-1)?.subject).not.toBe('email.unverified_account_linked.subject');
    expect(linked.user.avatar_url).toBe(google.avatar_url);
    expect(world.state.sessions).toHaveLength(2);
  });

  test('linking to an unverified account drops the unproven password and its sessions', async () => {
    const squatter = await accounts.signUp(signUp, facts, 'UTC');
    const squatterSession = world.state.sessions[0]!.id;

    const linked = await accounts.signInWithProvider(google, facts, tz);
    expect(linked.user.id).toBe(squatter.user.id);
    expect(linked.linked_unverified_account).toBe(true);
    expect(world.state.sent.at(-1)).toMatchObject({
      to: squatter.user.email,
      subject: 'email.unverified_account_linked.subject',
      params: { provider: 'Google', url: 'http://localhost:3000/settings?tab=security' },
    });
    expect(linked.user.password_hash).toBeNull();
    expect(linked.user.email_verified_at).not.toBeNull();
    expect(world.state.invalidated).toContain(squatterSession);
    expect(world.state.sessions.map(s => s.id)).not.toContain(squatterSession);
    await expect(accounts.signIn(credentials, facts)).rejects.toThrow('That email or password is incorrect.');
  });

  test('linking to an unverified account also revokes its access tokens and pending links', async () => {
    const squatter = await accounts.signUp(signUp, facts, 'UTC');
    const { changeToken } = await seedCredentials(squatter.user.id);

    await accounts.signInWithProvider(google, facts, tz);

    expect(world.state.patTokens).toHaveLength(1);
    expect(world.state.patTokens.every(t => t.revoked_at !== null)).toBe(true);
    expect(world.state.oneTimeTokens.filter(t => t.used_at === null)).toEqual([]);
    await expect(accounts.confirmEmailChange(changeToken)).rejects.toMatchObject({ code: 'auth.invalid_token' });
    expect(world.state.users[0]!.email).toBe(credentials.email);
  });

  test('linking to an unverified account also turns off the two-factor it set up', async () => {
    const squatter = await accounts.signUp(signUp, facts, 'UTC');
    Object.assign(world.state.users[0]!, {
      totp_secret_ciphertext: 'v1.sealed',
      totp_enabled_at: new Date(),
      totp_last_used_step: 42,
    });
    for (const used_at of [null, null, new Date()]) {
      world.state.recoveryCodes.push({
        id: world.state.recoveryCodes.length + 1,
        user_id: squatter.user.id,
        code_hash: Buffer.from('code'),
        used_at,
        created_at: new Date(),
      });
    }

    await accounts.signInWithProvider(google, facts, tz);

    expect(world.state.users[0]).toMatchObject({
      totp_secret_ciphertext: null,
      totp_enabled_at: null,
      totp_last_used_step: null,
    });
    expect(world.state.recoveryCodes.filter(r => r.used_at === null)).toEqual([]);
  });

  test('the recovery writes go through the transaction', async () => {
    await accounts.signUp(signUp, facts, 'UTC');
    const before = world.state.transactional.length;

    await accounts.signInWithProvider(google, facts, tz);

    expect(world.state.transactional.slice(before)).toEqual([
      'users.update',
      'recoveryCodes.deleteUnused',
      'tokens.revokeAllForUser',
      'oneTimeTokens.deleteAllInvolving',
      'sessions.deleteAllForUser',
    ]);
  });

  test('a provider sign-in to a verified account leaves its access tokens alone', async () => {
    const { user } = await signUpVerified();
    await seedCredentials(user.id);

    const linked = await accounts.signInWithProvider(google, facts, tz);

    expect(linked.linked_unverified_account).toBe(false);
    expect(world.state.patTokens[0]!.revoked_at).toBeNull();
    expect(world.state.oneTimeTokens.some(t => t.purpose === 'email_change')).toBe(true);
  });

  test('refuses to relink an account already tied to a different identity at that provider', async () => {
    await accounts.signInWithProvider(google, facts, tz);
    const other = accounts.signInWithProvider({ ...google, provider_id: 'g-2002' }, facts, tz);
    await expect(other).rejects.toThrow('already linked to a different account');
  });

  test('one account can hold both providers', async () => {
    const viaGoogle = await accounts.signInWithProvider(google, facts, tz);
    const viaGithub = await accounts.signInWithProvider(
      { ...google, provider: 'github', provider_id: '424242', avatar_url: 'https://avatars.githubusercontent.com/u/1' },
      facts,
      tz,
    );
    expect(viaGithub.user).toMatchObject({ id: viaGoogle.user.id, google_id: 'g-1001', github_id: '424242' });
  });

  test('a deactivated account cannot sign in through a provider', async () => {
    const { user } = await accounts.signInWithProvider(google, facts, tz);
    world.state.users.find(u => u.id === user.id)!.deactivated_at = new Date();
    await expect(accounts.signInWithProvider(google, facts, tz)).rejects.toThrow('deactivated');
  });

  test('the device timezone replaces the stored one on a returning sign-in', async () => {
    await accounts.signInWithProvider(google, facts, { fallback: 'UTC' });
    const { user } = await accounts.signInWithProvider(google, facts, { device: 'America/New_York', fallback: 'UTC' });
    expect(user.timezone).toBe('America/New_York');
  });
});

describe('when the mail provider rejects a send', () => {
  const failing = () => {
    const reported: unknown[] = [];
    let down = false;
    const service = accountsService({
      ...world.deps,
      mailer: {
        async send(message) {
          if (down) throw new Error('resend 422: invalid recipient');
          world.state.sent.push(message);
        },
      },
      analytics: { ...world.deps.analytics, captureException: err => reported.push(err) },
    });
    return { service, reported, goDown: () => (down = true) };
  };

  test('mail that follows a saved change never fails the request, and is reported', async () => {
    const { service, reported, goDown } = failing();
    const { user } = await service.signUp(signUp, facts, 'UTC');
    const before = user.password_hash;
    goDown();
    await service.changePassword(principalFor(user.id, 1), {
      current_password: credentials.password,
      password: 'a-different-long-password',
    });
    expect(world.state.users[0]!.password_hash).not.toBe(before);
    expect(reported).toHaveLength(1);
  });

  test('a password reset request still acknowledges, so no account is disclosed', async () => {
    const { service, reported, goDown } = failing();
    await service.signUp(signUp, facts, 'UTC');
    goDown();
    expect(await service.requestPasswordReset(credentials.email)).toEqual({ ok: true });
    expect(await service.requestPasswordReset('nobody@test.local')).toEqual({ ok: true });
    expect(reported).toHaveLength(1);
  });

  test('a request whose point is the email answers email.send_failed', async () => {
    const { service, goDown } = failing();
    const { user } = await service.signUp(signUp, facts, 'UTC');
    const verification = world.tokenFromLastEmail();
    goDown();
    const resend = service.resendVerification(principalFor(user.id, 1));
    await expect(resend).rejects.toMatchObject({ code: 'email.send_failed', status: 502 });
    await service.verifyEmail(verification);
    const change = service.requestEmailChange(principalFor(user.id, 1), {
      email: 'jordan.new@test.local',
      current_password: credentials.password,
    });
    await expect(change).rejects.toMatchObject({ code: 'email.send_failed', status: 502 });
  });
});
