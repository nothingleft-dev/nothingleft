import { describe, expect, test } from 'bun:test';
import { SESSION_COOKIE_NAME } from '@nothingleft/types';
import { testApp, testEnv } from './helpers.ts';
import { origin, password, uniqueStamp } from './people.ts';

/** Signs up through a pretend proxy and reads back what the session recorded. */
async function recordedFacts(TRUST_PROXY: string) {
  const app = await testApp({}, { ...testEnv, TRUST_PROXY });
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      headers: {
        ...origin,
        'x-forwarded-for': '203.0.113.7',
        'cf-ipcountry': 'DE',
        'x-vercel-ip-timezone': 'Asia/Tokyo',
      },
      body: { email: `proxy-${uniqueStamp()}@test.local`, password, name: 'Proxy' },
    });
    if (res.statusCode !== 201) throw new Error(res.body);
    const sid = res.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;
    const sessions = await app.inject({
      method: 'GET',
      url: '/v1/me/sessions',
      headers: { ...origin, cookie: `${SESSION_COOKIE_NAME}=${sid}` },
    });
    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { ...origin, cookie: `${SESSION_COOKIE_NAME}=${sid}` },
    });
    return {
      ...(sessions.json().data[0] as { ip: string | null; country_code: string | null }),
      timezone: me.json().data.timezone as string,
    };
  } finally {
    await app.close();
  }
}

describe('proxy trust', () => {
  test('14: with TRUST_PROXY=false, forwarding headers change neither the address nor the country', async () => {
    expect(await recordedFacts('false')).toMatchObject({ ip: '127.0.0.1', country_code: null, timezone: 'UTC' });
  });

  test('14: with TRUST_PROXY=1, the address one hop behind the proxy is the client', async () => {
    expect(await recordedFacts('1')).toMatchObject({ ip: '203.0.113.7', country_code: 'DE', timezone: 'Asia/Tokyo' });
  });

  test('14: a direct caller outside the trusted CIDR list cannot claim a country or timezone', async () => {
    expect(await recordedFacts('10.0.0.0/8')).toMatchObject({ ip: '127.0.0.1', country_code: null, timezone: 'UTC' });
  });
});
