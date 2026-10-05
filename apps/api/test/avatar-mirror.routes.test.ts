import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SESSION_COOKIE_NAME } from '@nothingleft/types';
import type { OAuthClient, ProviderProfile } from '@lib/oauth';
import { runQueued, type RecordingQueue } from '@lib/jobs';
import { providerOf } from '@services/avatar-mirror';
import { avatarKeyOwner } from '@lib/avatar';
import { testApp } from './helpers.ts';
import { memoryStorage } from './memory-storage.ts';
import { origin } from './people.ts';

const memory = memoryStorage();
let next: ProviderProfile;
let photo: () => Response = () =>
  new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
const fetched: string[] = [];
const google: OAuthClient = { authorizeUrl: () => 'https://accounts.google.test/auth', exchange: async () => next };
let app: Awaited<ReturnType<typeof testApp>>;

beforeAll(async () => {
  app = await testApp({
    oauthClients: { google },
    storage: { ...memory.storage, configured: true },
    avatarFetch: async url => {
      fetched.push(url);
      return photo();
    },
  });
});

afterAll(async () => {
  await app.close();
});

async function signInWithGoogle(avatar_url: string | null): Promise<string> {
  next = {
    provider: 'google',
    provider_id: `g-${crypto.randomUUID()}`,
    email: `mirror-${crypto.randomUUID()}@test.local`,
    email_verified: true,
    name: 'Kai',
    avatar_url,
  };
  const start = await app.inject({ method: 'POST', url: '/v1/auth/oauth/google/start', headers: origin });
  const state = start.cookies.find(c => c.name === 'oauth_state')!.value;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/oauth/google/callback',
    headers: { ...origin, cookie: `oauth_state=${state}` },
    body: { code: 'provider-code', state },
  });
  return res.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;
}

const meOf = async (sid: string) =>
  (await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie: `${SESSION_COOKIE_NAME}=${sid}` } })).json()
    .data as { id: number; avatar_url: string };

const avatarOf = async (sid: string) => (await meOf(sid)).avatar_url;

async function drain(): Promise<number> {
  const queue = app.jobQueue as RecordingQueue;
  let copied = 0;
  for (const job of queue.pending.splice(0))
    if (job.name === 'avatar.mirror') copied += await runQueued(app.queuedHandlers, job);
  return copied;
}

describe('avatar.mirror', () => {
  test('a first Google sign-in copies the provider photo under the account’s own prefix', async () => {
    const sid = await signInWithGoogle('https://lh3.googleusercontent.com/a/photo=s96-c');
    expect(await drain()).toBe(1);
    const { id, avatar_url } = await meOf(sid);
    expect(avatar_url).toMatch(new RegExp(`^web/avatar/${id}/[0-9a-f-]{36}\\.png$`));
    expect(avatarKeyOwner(avatar_url)).toBe(id);
    expect(memory.publicObjects.get(avatar_url)?.content_type).toBe('image/png');
  });

  test('a failed fetch leaves the provider URL in place', async () => {
    photo = () => new Response('nope', { status: 404 });
    const sid = await signInWithGoogle('https://lh3.googleusercontent.com/a/missing');
    expect(await drain()).toBe(0);
    expect(await avatarOf(sid)).toBe('https://lh3.googleusercontent.com/a/missing');
  });

  test('only the providers’ own hosts are ever fetched', async () => {
    fetched.length = 0;
    await signInWithGoogle('https://evil.example/avatar.png');
    expect(await drain()).toBe(0);
    expect(fetched).toEqual([]);
    expect(providerOf('http://lh3.googleusercontent.com/a')).toBeNull();
    expect(providerOf('https://avatars.githubusercontent.com/u/1')).toBe('github');
    expect(providerOf('https://googleusercontent.com.evil.example/a')).toBeNull();
  });
});
