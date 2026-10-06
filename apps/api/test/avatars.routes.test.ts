import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { AVATAR_SEED_MAX_LENGTH } from '@config/constants';
import { renderAvatar } from '@lib/avatar';
import { testApp } from './helpers.ts';

let app: Awaited<ReturnType<typeof testApp>>;

beforeAll(async () => {
  app = await testApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /avatars/:kind', () => {
  test('answers the mark as an immutable SVG, without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/avatars/person?seed=Jordan%20Rivera' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/svg+xml; charset=utf-8');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['content-security-policy']).toStartWith("default-src 'none'");
    expect(res.body).toBe(renderAvatar('person', 'Jordan Rivera'));
  });

  test.each(['person', 'project', 'organization'])('draws a %s', async kind => {
    const res = await app.inject({ method: 'GET', url: `/avatars/${kind}?seed=PP` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toStartWith('<svg');
  });

  test.each([
    ['an unknown kind', '/avatars/robot?seed=PP'],
    ['no seed', '/avatars/person'],
    ['an empty seed', '/avatars/person?seed='],
    ['an over-long seed', `/avatars/person?seed=${'a'.repeat(AVATAR_SEED_MAX_LENGTH + 1)}`],
  ])('refuses %s with the error envelope', async (_label, url) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_failed');
  });
});
