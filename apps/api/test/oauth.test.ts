import { beforeEach, describe, expect, test } from 'bun:test';
import { sha256 } from '@lib/crypto';
import { githubClient, googleClient, type OAuthClient, type ProviderProfile } from '@lib/oauth';
import { accountsService } from '@services/accounts.service';
import { oauthService, type OAuthService } from '@services/oauth.service';
import { stubWorld } from './stubs.ts';

const credentials = { clientId: 'client-id', clientSecret: 'client-secret' };
const redirect = {
  code: 'the-code',
  codeVerifier: 'the-verifier',
  redirectUri: 'http://localhost:3000/auth/x/callback',
};

type Route = { status?: number; body: unknown };

function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const route = routes[url];
    if (!route) return new Response('not found', { status: 404 });
    return Response.json(route.body, { status: route.status ?? 200 });
  };
  return { impl, calls };
}

describe('googleClient', () => {
  test('the authorize URL carries state, an S256 challenge and the openid scopes', () => {
    const url = new URL(
      googleClient(credentials).authorizeUrl({ state: 'st', codeChallenge: 'ch', redirectUri: redirect.redirectUri }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client-id',
      response_type: 'code',
      scope: 'openid email profile',
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      redirect_uri: redirect.redirectUri,
    });
  });

  test('exchanges the code with the verifier and reads the verified flag from userinfo', async () => {
    const { impl, calls } = fakeFetch({
      'https://oauth2.googleapis.com/token': { body: { access_token: 'at' } },
      'https://openidconnect.googleapis.com/v1/userinfo': {
        body: { sub: '1009', email: 'a@gmail.com', email_verified: true, name: 'Ada', picture: 'https://lh3/a' },
      },
    });
    const profile = await googleClient(credentials, impl).exchange(redirect);

    expect(profile).toEqual({
      provider: 'google',
      provider_id: '1009',
      email: 'a@gmail.com',
      email_verified: true,
      name: 'Ada',
      avatar_url: 'https://lh3/a',
    });
    const form = new URLSearchParams(calls[0]!.init!.body as string);
    expect(form.get('code_verifier')).toBe('the-verifier');
    expect(form.get('grant_type')).toBe('authorization_code');
  });

  test('a rejected code surfaces as auth.oauth_failed', async () => {
    const { impl } = fakeFetch({
      'https://oauth2.googleapis.com/token': { status: 400, body: { error: 'invalid_grant' } },
    });
    await expect(googleClient(credentials, impl).exchange(redirect)).rejects.toMatchObject({
      code: 'auth.oauth_failed',
      status: 502,
    });
  });
});

describe('githubClient', () => {
  const user = { id: 424242, login: 'ada', name: null, avatar_url: 'https://avatars.githubusercontent.com/u/424242' };

  const world = (emails: unknown) =>
    fakeFetch({
      'https://github.com/login/oauth/access_token': { body: { access_token: 'gho_x' } },
      'https://api.github.com/user': { body: user },
      'https://api.github.com/user/emails': { body: emails },
    });

  test('uses the primary verified address from /user/emails and the login as a name fallback', async () => {
    const { impl } = world([
      { email: 'public@example.com', primary: false, verified: true },
      { email: 'ada@example.com', primary: true, verified: true },
    ]);
    expect(await githubClient(credentials, impl).exchange(redirect)).toEqual({
      provider: 'github',
      provider_id: '424242',
      email: 'ada@example.com',
      email_verified: true,
      name: 'ada',
      avatar_url: user.avatar_url,
    });
  });

  test('an unverified primary address is reported as unverified, not swapped for another', async () => {
    const { impl } = world([
      { email: 'ada@example.com', primary: true, verified: false },
      { email: 'other@example.com', primary: false, verified: true },
    ]);
    const profile = await githubClient(credentials, impl).exchange(redirect);
    expect(profile).toMatchObject({ email: 'ada@example.com', email_verified: false });
  });

  test('GitHub answers a bad code with 200 and an error body; that is still a failure', async () => {
    const { impl } = fakeFetch({
      'https://github.com/login/oauth/access_token': { body: { error: 'bad_verification_code' } },
    });
    await expect(githubClient(credentials, impl).exchange(redirect)).rejects.toMatchObject({
      code: 'auth.oauth_failed',
    });
  });
});

describe('oauthService', () => {
  const facts = { ip: '203.0.113.9', user_agent: 'Bun/test', country_code: 'IN' };
  const profile: ProviderProfile = {
    provider: 'google',
    provider_id: 'g-1',
    email: 'flow@test.local',
    email_verified: true,
    name: 'Flow',
    avatar_url: null,
  };

  let store: Map<string, string>;
  let exchanged: { code: string; codeVerifier: string; redirectUri: string }[];
  let oauth: OAuthService;

  beforeEach(() => {
    store = new Map();
    exchanged = [];
    const client: OAuthClient = {
      authorizeUrl: ({ state, codeChallenge, redirectUri }) =>
        `https://provider.test/authorize?state=${state}&code_challenge=${codeChallenge}&redirect_uri=${redirectUri}`,
      async exchange(input) {
        exchanged.push(input);
        return profile;
      },
    };
    oauth = oauthService({
      clients: { google: client, github: client },
      accounts: accountsService(stubWorld().deps),
      store: {
        async set(key, value) {
          store.set(key, value);
        },
        async getdel(key) {
          const value = store.get(key) ?? null;
          store.delete(key);
          return value;
        },
      },
      appBaseUrl: 'http://localhost:3000',
    });
  });

  test('start stores the verifier under a fresh state and sends only its S256 challenge', async () => {
    const { state, authorize_url } = await oauth.start('google');
    const params = new URL(authorize_url).searchParams;
    const pending = JSON.parse(store.get(`oauth:${state}`)!);

    expect(params.get('state')).toBe(state);
    expect(params.get('code_challenge')).toBe(sha256(pending.verifier).toString('base64url'));
    expect(authorize_url).not.toContain(pending.verifier);
    expect(params.get('redirect_uri')).toBe('http://localhost:3000/auth/google/callback');
  });

  test('complete exchanges with the stored verifier and signs the user in', async () => {
    const { state } = await oauth.start('google');
    const pending = JSON.parse(store.get(`oauth:${state}`)!);

    const session = await oauth.complete('google', { code: 'c', state }, state, facts, 'UTC');
    expect(session.created).toBe(true);
    expect(session.user.email).toBe('flow@test.local');
    expect(exchanged[0]).toEqual({
      code: 'c',
      codeVerifier: pending.verifier,
      redirectUri: 'http://localhost:3000/auth/google/callback',
    });
  });

  test('a state is spent on first use', async () => {
    const { state } = await oauth.start('google');
    await oauth.complete('google', { code: 'c', state }, state, facts, 'UTC');
    await expect(oauth.complete('google', { code: 'c', state }, state, facts, 'UTC')).rejects.toMatchObject({
      code: 'auth.oauth_state_invalid',
    });
  });

  test('a callback whose state is not bound to this browser is refused before any exchange', async () => {
    const { state } = await oauth.start('google');
    for (const bound of [undefined, 'someone-elses-state']) {
      await expect(oauth.complete('google', { code: 'c', state }, bound, facts, 'UTC')).rejects.toMatchObject({
        code: 'auth.oauth_state_invalid',
      });
    }
    expect(exchanged).toHaveLength(0);
  });

  test('a state issued for one provider cannot complete another', async () => {
    const { state } = await oauth.start('google');
    await expect(oauth.complete('github', { code: 'c', state }, state, facts, 'UTC')).rejects.toMatchObject({
      code: 'auth.oauth_state_invalid',
    });
    expect(exchanged).toHaveLength(0);
  });

  test('an unconfigured provider answers oauth_not_configured', async () => {
    const bare = oauthService({
      clients: {},
      accounts: accountsService(stubWorld().deps),
      store: { set: async () => {}, getdel: async () => null },
      appBaseUrl: 'http://localhost:3000',
    });
    await expect(bare.start('github')).rejects.toMatchObject({ code: 'auth.oauth_not_configured', status: 503 });
  });
});
