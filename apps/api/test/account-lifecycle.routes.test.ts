import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SESSION_COOKIE_NAME } from '@nothingleft/types';
import type { OAuthClient, ProviderProfile } from '@lib/oauth';
import { totpCode } from '@lib/totp';
import { issueWorld, type IssueWorld, type Member } from './issue-world.ts';
import { origin, password, signUp, type Person } from './people.ts';

let w: IssueWorld;
let next: ProviderProfile;
const google: OAuthClient = { authorizeUrl: () => 'https://accounts.google.test/auth', exchange: async () => next };

async function join(name: string): Promise<Member> {
  const person = await signUp(w.app, w.box, name);
  const link = (await w.call(w.admin, 'POST', `/v1/organizations/${w.slug}/invitations/links`, {})).json().data;
  await w.call(person, 'POST', '/v1/invitations/accept', { token: /\/invite\/(.+)$/.exec(link.url)![1] });
  const username = (await w.call(person, 'GET', `/v1/organizations/${w.slug}`)).json().data.membership.username;
  await w.call(w.admin, 'POST', `/v1/projects/${w.key}/members`, { username, role: 'contributor' });
  return { ...person, username };
}

async function token(who: Person): Promise<string> {
  return (await w.call(who, 'POST', '/v1/me/tokens', { name: 'CI', scopes: ['issues:read'] })).json().data.token;
}

const asToken = (pat: string, url: string) =>
  w.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${pat}` } });

beforeAll(async () => {
  w = await issueWorld('DA', { oauthClients: { google } });
});

afterAll(async () => {
  await w.close();
});

describe('POST /v1/me/deactivate', () => {
  test('needs the password, and a code when two-factor is on', async () => {
    const who = await join('Drew');
    expect((await w.call(who, 'POST', '/v1/me/deactivate', {})).json().error.code).toBe('auth.password_required');
    const wrong = await w.call(who, 'POST', '/v1/me/deactivate', { current_password: 'not-it' });
    expect(wrong.json().error.code).toBe('auth.wrong_password');

    const { secret } = (await w.call(who, 'POST', '/v1/me/two-factor/setup')).json().data;
    const at = new Date(Date.now() + 30_000);
    await w.call(who, 'POST', '/v1/me/two-factor/confirm', { code: totpCode(secret, at), current_password: password });
    const noCode = await w.call(who, 'POST', '/v1/me/deactivate', { current_password: password });
    expect(noCode.json().error.code).toBe('two_factor.code_required');
  });

  test('a deactivated account cannot sign in, and none of its sessions or tokens work', async () => {
    const who = await join('Avery');
    const pat = await token(who);
    const filed = (await w.call(who, 'POST', '/v1/issues', { project: w.key, title: 'Filed before leaving' })).json()
      .data.key;
    const second = await w.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      headers: origin,
      body: { email: who.email, password },
    });
    const otherSid = second.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;
    expect((await asToken(pat, '/v1/me')).statusCode).toBe(200);

    const res = await w.call(who, 'POST', '/v1/me/deactivate', { current_password: password });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.find(c => c.name === SESSION_COOKIE_NAME)?.value).toBe('');
    expect(w.box.last(who.email)?.subject).toBe('email.account_deactivated.subject');

    expect((await w.call(who, 'GET', '/v1/me')).statusCode).toBe(401);
    const other = await w.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${otherSid}` },
    });
    expect(other.statusCode).toBe(401);
    expect((await asToken(pat, '/v1/me')).statusCode).toBe(401);
    const signIn = await w.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      headers: origin,
      body: { email: who.email, password },
    });
    expect(signIn.json().error.code).toBe('auth.account_deactivated');

    // Membership stays, marked for the admins, and the person drops out of the pickers.
    const member = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/members/${who.username}`)).json().data;
    expect(member).toMatchObject({ name: 'Avery', deactivated: true, former_member: false, email_verified: true });
    const history = (await w.call(w.admin, 'GET', `/v1/issues/${filed}/activity`)).json().data;
    expect(history[0].actor).toMatchObject({ name: 'Avery', deactivated: true });
    const audit = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity`)).json().data;
    const joined = audit.find((a: { actor: { username: string } | null }) => a.actor?.username === who.username);
    expect(joined.actor).toMatchObject({ deactivated: true, former_member: false });
    const assignees = (await w.call(w.admin, 'GET', `/v1/projects/${w.key}/assignees`)).json().data;
    expect(assignees.map((a: { username: string }) => a.username)).not.toContain(who.username);
  });

  test('the platform operator reactivates it; its memberships come back, its tokens do not', async () => {
    const who = await join('Blake');
    const pat = await token(who);
    await w.app.accountLifecycle.deactivateByEmail(who.email);
    expect((await asToken(pat, '/v1/me')).statusCode).toBe(401);

    await w.app.accountLifecycle.reactivateByEmail(who.email);
    expect(w.box.last(who.email)?.subject).toBe('email.account_reactivated.subject');
    const signIn = await w.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      headers: origin,
      body: { email: who.email, password },
    });
    expect(signIn.statusCode).toBe(200);
    expect((await asToken(pat, '/v1/me')).statusCode).toBe(401);
    const member = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/members/${who.username}`)).json().data;
    expect(member.deactivated).toBe(false);
  });

  test('an Owner is refused until the organisation has another owner or is gone', async () => {
    const res = await w.call(w.admin, 'POST', '/v1/me/deactivate', { current_password: password });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'account.owns_organization', valid_values: [w.slug] });
  });

  test('an account with no password confirms by a recent Google sign-in', async () => {
    next = {
      provider: 'google',
      provider_id: `g-${crypto.randomUUID()}`,
      email: `provider-${crypto.randomUUID()}@test.local`,
      email_verified: true,
      name: 'Rowan',
      avatar_url: null,
    };
    const start = await w.app.inject({ method: 'POST', url: '/v1/auth/oauth/google/start', headers: origin });
    const state = start.cookies.find(c => c.name === 'oauth_state')!.value;
    const res = await w.app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/google/callback',
      headers: { ...origin, cookie: `oauth_state=${state}` },
      body: { code: 'provider-code', state },
    });
    const sid = res.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;
    const deactivated = await w.app.inject({
      method: 'POST',
      url: '/v1/me/deactivate',
      headers: { ...origin, cookie: `${SESSION_COOKIE_NAME}=${sid}` },
      body: {},
    });
    expect(deactivated.statusCode).toBe(200);
  });

  test('an access token cannot deactivate its owner', async () => {
    const who = await join('Emery');
    const res = await w.app.inject({
      method: 'POST',
      url: '/v1/me/deactivate',
      headers: { authorization: `Bearer ${await token(who)}` },
      body: { current_password: password },
    });
    expect(res.json().error.code).toBe('auth.session_required');
  });
});
