// A minute: an agent's burst of calls costs one GET /v1/me against the PAT's rate limit, not one each.
const TTL_MS = 60_000;
const SWEEP_AT = 1_000;

export interface TimeZoneCache {
  get(userId: number): string | undefined;
  set(userId: number, zone: string): void;
}

export function timeZoneCache(now = () => Date.now()): TimeZoneCache {
  const entries = new Map<number, { zone: string; until: number }>();
  return {
    get(userId) {
      const entry = entries.get(userId);
      if (entry && entry.until > now()) return entry.zone;
      entries.delete(userId);
      return undefined;
    },
    set(userId, zone) {
      if (entries.size >= SWEEP_AT) for (const [id, e] of entries) if (e.until <= now()) entries.delete(id);
      entries.set(userId, { zone, until: now() + TTL_MS });
    },
  };
}
