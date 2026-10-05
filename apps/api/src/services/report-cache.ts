import { createHash } from 'node:crypto';
import { REPORT_CACHE_TTL_SECONDS } from '@config/constants';

/** The slice of the Redis client the report cache needs; typed structurally so tests can stand one in. */
export interface ReportCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  incr(key: string): Promise<number>;
}

const versionKey = (orgId: number) => `report:v:${orgId}`;

/** JSON with object keys sorted, so equal parameters always hash alike. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/**
 * Report results by organisation data version: any write in the organisation bumps the version,
 * so a cached result never outlives the data it was computed from. Redis failing means no cache.
 */
export function reportCache(store: ReportCacheStore, ttlSeconds = REPORT_CACHE_TTL_SECONDS) {
  return {
    async bump(orgId: number): Promise<void> {
      try {
        await store.incr(versionKey(orgId));
      } catch {
        // No Redis: nothing is cached either, so nothing can go stale.
      }
    },

    /** `parts` must name everything the result depends on besides the organisation's data. */
    async remember<T>(
      orgId: number,
      parts: unknown,
      compute: () => Promise<T>,
    ): Promise<{ value: T; cached: boolean }> {
      let key: string | null;
      try {
        const version = (await store.get(versionKey(orgId))) ?? '0';
        key = `report:${orgId}:${createHash('sha256')
          .update(canonicalJson([parts, version]))
          .digest('hex')}`;
        const hit = await store.get(key);
        if (hit !== null) return { value: JSON.parse(hit) as T, cached: true };
      } catch {
        key = null;
      }
      const value = await compute();
      if (key) {
        try {
          await store.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        } catch {
          // A failed write only means the next request computes it again.
        }
      }
      return { value, cached: false };
    },
  };
}

export type ReportCache = ReturnType<typeof reportCache>;
