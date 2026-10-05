import { describe, expect, test } from 'bun:test';
import { HEALTH_DEEP_MAX_PER_MINUTE, HEALTH_DEEP_MEMO_MS } from '@config/constants';
import type { Storage } from '@lib/storage';
import { testApp } from './helpers.ts';
import { memoryStorage } from './memory-storage.ts';

type App = Awaited<ReturnType<typeof testApp>>;

const deep = (app: App) => app.inject({ method: 'GET', url: '/health/deep' });

/** An in-memory bucket whose probe is counted, slow enough to overlap, and can be told to fail. */
function countedStorage() {
  const { storage } = memoryStorage();
  const counter = { probes: 0, fail: false };
  const bucket = storage.private!;
  const counted: Storage = {
    ...storage,
    private: {
      ...bucket,
      probe: async () => {
        counter.probes++;
        await Bun.sleep(25);
        if (counter.fail) throw new Error('bucket unreachable');
      },
    },
  };
  return { storage: counted, counter };
}

async function withApp(opts: Parameters<typeof testApp>[0], body: (app: App) => Promise<void>) {
  const app = await testApp(opts);
  try {
    await body(app);
  } finally {
    await app.close();
  }
}

describe('GET /health/deep', () => {
  test('reports db, redis and storage reachable', () =>
    withApp({}, async app => {
      const res = await deep(app);
      expect(res.statusCode).toBe(200);
      const { status, checks } = res.json().data;
      expect(status).toBe('ok');
      expect(checks.db).toBe('ok');
      expect(checks.redis).toBe('ok');
      // ok against the local S3 stand-in, not_configured without one; never a failure.
      expect(['ok', 'not_configured']).toContain(checks.storage);
    }));

  test('13: twenty concurrent calls share one probe, and those past the limit answer 429', () => {
    const { storage, counter } = countedStorage();
    return withApp({ storage }, async app => {
      const codes = (await Promise.all(Array.from({ length: 20 }, () => deep(app)))).map(r => r.statusCode);
      expect(codes.filter(c => c === 200)).toHaveLength(HEALTH_DEEP_MAX_PER_MINUTE);
      expect(codes.filter(c => c === 429)).toHaveLength(20 - HEALTH_DEEP_MAX_PER_MINUTE);
      expect(counter.probes).toBe(1);
    });
  });

  test('13: the eleventh call in a minute from one address answers 429', () =>
    withApp({}, async app => {
      for (let i = 0; i < HEALTH_DEEP_MAX_PER_MINUTE; i++) expect((await deep(app)).statusCode).not.toBe(429);
      const over = await deep(app);
      expect(over.statusCode).toBe(429);
      expect(over.json().error.code).toBe('rate_limited');
    }));

  test('a failing answer is shared for the memo window, then probed again', () => {
    const { storage, counter } = countedStorage();
    let clock = new Date('2026-10-01T09:00:00Z');
    const step = () => {
      clock = new Date(clock.getTime() + HEALTH_DEEP_MEMO_MS);
    };
    return withApp({ storage, now: () => clock }, async app => {
      expect((await deep(app)).statusCode).toBe(200);
      expect((await deep(app)).statusCode).toBe(200);
      expect(counter.probes).toBe(1);

      counter.fail = true;
      step();
      const failing = await deep(app);
      expect(failing.statusCode).toBe(503);
      expect(failing.json().data.checks.storage).toBe('fail');
      expect((await deep(app)).statusCode).toBe(503);
      expect(counter.probes).toBe(2);

      counter.fail = false;
      step();
      expect((await deep(app)).statusCode).toBe(200);
      expect(counter.probes).toBe(3);
    });
  });
});
