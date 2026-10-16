import { describe, expect, test } from 'bun:test';
import { timeZoneCache } from '../src/time-zones.ts';

describe('timezone cache', () => {
  test('a timezone is kept for a minute, then looked up again', () => {
    let now = 0;
    const cache = timeZoneCache(() => now);
    cache.set(7, 'Asia/Kolkata');
    now = 59_999;
    expect(cache.get(7)).toBe('Asia/Kolkata');
    now = 60_000;
    expect(cache.get(7)).toBeUndefined();
  });

  test('one person’s timezone is never another’s', () => {
    const cache = timeZoneCache();
    cache.set(7, 'Asia/Kolkata');
    expect(cache.get(8)).toBeUndefined();
  });
});
