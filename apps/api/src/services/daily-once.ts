/** The slice of the Redis client a once-a-day check needs; typed structurally so nothing depends on the driver. */
export interface DailyOnceStore {
  set(key: string, value: string, mode: 'EX', ttl: number, flag: 'NX'): Promise<string | null>;
}

const DAY_MS = 86_400_000;

/**
 * True the first time `key` is seen in the current UTC day. Pages that poll would otherwise
 * count every refresh as a use; Redis down counts the call, as `user_active_day` does.
 */
export async function dailyOnce(store: DailyOnceStore, key: string, now: Date): Promise<boolean> {
  const day = Math.floor(now.getTime() / DAY_MS);
  const secondsLeft = Math.max(1, Math.ceil(((day + 1) * DAY_MS - now.getTime()) / 1000));
  try {
    return (await store.set(`once:${key}:${day}`, '1', 'EX', secondsLeft, 'NX')) === 'OK';
  } catch {
    return true;
  }
}
