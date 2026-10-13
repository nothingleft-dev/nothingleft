import { describe, expect, test } from 'bun:test';
import { REPORT_CACHE_TTL_SECONDS, REPORT_VERSION_TTL_SECONDS } from '@config/constants';
import {
  canonicalJson,
  reportCache,
  type ReportCacheStore,
  type ReportCacheTransaction,
} from '../src/services/report-cache.ts';
import { seriesSlots } from '../src/services/reports.service.ts';

function memoryStore() {
  const data = new Map<string, string>();
  const ttls = new Map<string, number>();
  const expiresAt = new Map<string, number>();
  let clock = 0;
  let incrFails = false;
  const live = (key: string) => {
    if ((expiresAt.get(key) ?? Infinity) <= clock) {
      data.delete(key);
      expiresAt.delete(key);
    }
    return data.get(key) ?? null;
  };
  const expire = (key: string, seconds: number) => {
    ttls.set(key, seconds);
    expiresAt.set(key, clock + seconds);
  };
  const store: ReportCacheStore = {
    get: async key => live(key),
    getex: async (key, _mode, seconds) => {
      const value = live(key);
      if (value !== null) expire(key, seconds);
      return value;
    },
    set: async (key, value, _mode, ttl) => {
      data.set(key, value);
      expire(key, ttl);
    },
    multi: () => {
      const queued: (() => void)[] = [];
      const tx: ReportCacheTransaction = {
        incr: (key: string) => {
          queued.push(() => {
            if (incrFails) throw new Error('connection refused');
            data.set(key, String(Number(live(key) ?? 0) + 1));
          });
          return tx;
        },
        expire: (key: string, seconds: number) => {
          queued.push(() => expire(key, seconds));
          return tx;
        },
        exec: async () => {
          for (const op of queued) op();
          return [];
        },
      };
      return tx;
    },
  };
  return {
    ...store,
    data,
    ttls,
    advance: (seconds: number) => {
      clock += seconds;
    },
    failIncr: () => {
      incrFails = true;
    },
  };
}

const down: ReportCacheStore = {
  get: () => Promise.reject(new Error('connection refused')),
  getex: () => Promise.reject(new Error('connection refused')),
  set: () => Promise.reject(new Error('connection refused')),
  multi: () => {
    const tx: ReportCacheTransaction = {
      incr: () => tx,
      expire: () => tx,
      exec: () => Promise.reject(new Error('connection refused')),
    };
    return tx;
  },
};

describe('report cache', () => {
  test('serves a hit until the organisation’s data version moves', async () => {
    const cache = reportCache(memoryStore());
    let runs = 0;
    const compute = async () => ({ n: ++runs });
    expect(await cache.remember(1, { a: 1 }, compute)).toEqual({ value: { n: 1 }, cached: false });
    expect(await cache.remember(1, { a: 1 }, compute)).toEqual({ value: { n: 1 }, cached: true });
    expect((await cache.remember(1, { a: 2 }, compute)).cached).toBe(false);
    await cache.bump(2);
    expect((await cache.remember(1, { a: 1 }, compute)).cached).toBe(true);
    await cache.bump(1);
    expect(await cache.remember(1, { a: 1 }, compute)).toEqual({ value: { n: 3 }, cached: false });
  });

  test('Redis down means no cache, never a failure', async () => {
    const cache = reportCache(down);
    await cache.bump(1);
    expect(await cache.remember(1, {}, async () => 'fresh')).toEqual({ value: 'fresh', cached: false });
  });

  test('a bump expires the version key, long after any result keyed by it', async () => {
    const store = memoryStore();
    await reportCache(store).bump(1);
    expect(store.data.get('report:v:1')).toBe('1');
    expect(store.ttls.get('report:v:1')).toBe(REPORT_VERSION_TTL_SECONDS);
    expect(REPORT_VERSION_TTL_SECONDS).toBeGreaterThanOrEqual(2 * REPORT_CACHE_TTL_SECONDS);
  });

  test('reading keeps the version alive, so a write after a quiet week cannot reuse an old version', async () => {
    const store = memoryStore();
    const cache = reportCache(store);
    await cache.bump(1);
    let runs = 0;
    const compute = async () => ({ n: ++runs });
    store.advance(REPORT_VERSION_TTL_SECONDS - 60);
    await cache.remember(1, {}, compute);
    store.advance(120);
    await cache.bump(1);
    expect(await cache.remember(1, {}, compute)).toEqual({ value: { n: 2 }, cached: false });
  });

  test('a bump whose INCR fails keeps the old version, so a result outlives the write by at most one result TTL', async () => {
    const store = memoryStore();
    const cache = reportCache(store);
    await cache.bump(1);
    let runs = 0;
    const compute = async () => ({ n: ++runs });
    await cache.remember(1, {}, compute);
    store.failIncr();
    await cache.bump(1);
    expect(store.data.get('report:v:1')).toBe('1');
    expect(await cache.remember(1, {}, compute)).toEqual({ value: { n: 1 }, cached: true });
    expect([...store.ttls].filter(([key]) => key !== 'report:v:1').map(([, ttl]) => ttl)).toEqual([
      REPORT_CACHE_TTL_SECONDS,
    ]);
  });

  test('parameters hash alike whatever their key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3] } })).toBe(canonicalJson({ a: { c: [3], d: 2 }, b: 1 }));
  });
});

describe('series slots', () => {
  test('the eight heaviest get a slot, numbered in natural order; the rest fold', () => {
    const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 10];
    const slots = seriesSlots(
      weights,
      weights.map((_, i) => i),
    );
    expect(slots).toEqual([null, 1, 2, 3, 4, 5, 6, 7, null, 8]);
  });

  test('a filter that drops a small series keeps the others’ colours when the set is unchanged', () => {
    expect(seriesSlots([5, 0, 3], [0, 1, 2])).toEqual([1, null, 2]);
  });
});
