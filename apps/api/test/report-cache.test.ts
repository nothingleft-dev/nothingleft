import { describe, expect, test } from 'bun:test';
import { canonicalJson, reportCache, type ReportCacheStore } from '../src/services/report-cache.ts';
import { seriesSlots } from '../src/services/reports.service.ts';

function memoryStore(): ReportCacheStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async key => data.get(key) ?? null,
    set: async (key, value) => data.set(key, value),
    incr: async key => {
      const next = Number(data.get(key) ?? 0) + 1;
      data.set(key, String(next));
      return next;
    },
  };
}

const down: ReportCacheStore = {
  get: () => Promise.reject(new Error('connection refused')),
  set: () => Promise.reject(new Error('connection refused')),
  incr: () => Promise.reject(new Error('connection refused')),
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
