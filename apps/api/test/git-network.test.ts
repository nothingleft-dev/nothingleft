import { describe, expect, test } from 'bun:test';
import { isPrivateAddress, isPublicUrl } from '@lib/network';
import { maskHookId } from '@lib/logger';
import type { GitProviderError } from '@git/http';
import { gitPages, gitRequest, guardedFetch } from '@git/http';
import { fakeFetch } from './git-fake-fetch.ts';

const reason = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as GitProviderError).reason;

describe('private addresses', () => {
  test('every reserved IPv4 range, written any way IPv6 can carry it', () => {
    for (const ip of [
      '10.1.2.3',
      '127.0.0.1',
      '169.254.169.254',
      '172.20.0.1',
      '192.168.1.1',
      '100.64.0.1',
      '198.18.0.1',
      '192.0.0.8',
      '0.0.0.0',
      '::1',
      '::',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:a9fe:a9fe',
      '64:ff9b::a00:1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'fec0::1',
      'ff02::1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  test('public addresses pass', () => {
    for (const ip of ['93.184.216.34', '140.82.112.3', '2606:4700::6810:84e5', '::ffff:93.184.216.34']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  test('a URL is public only when every address it resolves to is', async () => {
    expect(await isPublicUrl('https://[::ffff:7f00:1]/', async () => [])).toBe(false);
    expect(await isPublicUrl('https://git.example.com', async () => ['93.184.216.34', '10.0.0.1'])).toBe(false);
    expect(await isPublicUrl('https://git.example.com', async () => ['93.184.216.34'])).toBe(true);
    expect(
      await isPublicUrl('https://nowhere.example', async () => {
        throw new Error('ENOTFOUND');
      }),
    ).toBe(false);
  });
});

describe('provider requests', () => {
  test('a host that resolves privately is never reached, on any request', async () => {
    const { fetch, calls } = fakeFetch({ 'GET https://git.example.com/api/v4/user': { id: 1 } });
    let address = '93.184.216.34';
    const guarded = guardedFetch(fetch, async () => [address], false);
    expect((await gitRequest(guarded, 'https://git.example.com/api/v4/user')).status).toBe(200);
    address = '10.0.0.5';
    expect(await reason(gitRequest(guarded, 'https://git.example.com/api/v4/user'))).toBe('unreachable');
    expect(calls.length).toBe(1);
    expect(
      (
        await gitRequest(
          guardedFetch(fetch, async () => ['10.0.0.5'], true),
          'https://git.example.com/api/v4/user',
        )
      ).status,
    ).toBe(200);
  });

  test('a next page on another origin is refused', async () => {
    const { fetch } = fakeFetch({
      'GET https://git.example.com/api/v4/projects': {
        status: 200,
        body: [{ id: 1 }],
        headers: { link: '<http://169.254.169.254/latest>; rel="next"' },
      },
    });
    expect(await reason(gitPages(fetch, 'https://git.example.com/api/v4/projects', {}, (p: unknown[]) => p, 100))).toBe(
      'invalid',
    );
  });

  test('a response over 10 MB is refused', async () => {
    const { fetch } = fakeFetch({
      'GET https://git.example.com/big': { status: 200, body: 'x'.repeat(11 * 1024 * 1024) },
    });
    expect(await reason(gitRequest(fetch, 'https://git.example.com/big'))).toBe('invalid');
  });
});

test('a hook URL id never reaches a log line', () => {
  expect(maskHookId('/v1/git/webhooks/gitlab/AbC123abc123ABC123abc123ABC123abc123ABCD')).toBe(
    '/v1/git/webhooks/gitlab/[redacted]',
  );
  expect(maskHookId('/v1/git/webhooks/github')).toBe('/v1/git/webhooks/github');
  expect(maskHookId('/v1/issues/PH-1')).toBe('/v1/issues/PH-1');
});
