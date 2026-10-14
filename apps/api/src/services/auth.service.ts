import {
  SESSION_CACHE_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  type Credential,
  type PatScope,
  type Principal,
} from '@nothingleft/types';
import {
  systemContext,
  type PersonalAccessTokensRepository,
  type SessionsRepository,
  type UserRow,
  type UsersRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { PAT_LAST_USED_RESOLUTION_MS, SESSION_ROLLING_REFRESH_MS } from '@config/constants';
import { sha256 } from '@lib/crypto';

/** The slice of the Redis client this service uses; typed structurally so nothing
 *  outside app.ts depends on the driver. */
export interface SessionCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  set(key: string, value: string, mode: 'EX', ttl: number, flag: 'NX'): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

interface CachedSession {
  session_id: number;
  user_id: number;
  current_org_id: number | null;
  last_seen_at: string;
}

const sessionKey = (hashHex: string) => `sess:${hashHex}`;
const sessionIdKey = (id: number) => `sessid:${id}`;
const revokedKey = (id: number) => `sessrevoked:${id}`;
const activeDayKey = (userId: number, day: number) => `active:${userId}:${day}`;

const DAY_MS = 86_400_000;
const utcDay = (at: Date) => Math.floor(at.getTime() / DAY_MS);

export interface AuthDeps {
  users: UsersRepository;
  sessions: SessionsRepository;
  tokens: PersonalAccessTokensRepository;
  redis: SessionCache;
  analytics: Analytics;
}

export function authService({ users, sessions, tokens, redis, analytics }: AuthDeps) {
  const ctx = systemContext('resolve a credential before any organisation is known');
  // Saves a Redis round trip on every request after a user's first of the day in this process.
  const markedToday = new Map<number, number>();

  async function markActiveDay(user: UserRow, principal: Principal): Promise<void> {
    const now = new Date();
    const today = utcDay(now);
    if (markedToday.get(user.id) === today) return;
    if (markedToday.size > 10_000) markedToday.clear();
    markedToday.set(user.id, today);
    const secondsLeft = Math.max(1, Math.ceil(((today + 1) * DAY_MS - now.getTime()) / 1000));
    let first = true;
    try {
      first = (await redis.set(activeDayKey(user.id, today), '1', 'EX', secondsLeft, 'NX')) === 'OK';
    } catch {
      // Redis down: count the day anyway; a repeat moves no funnel, a miss would.
    }
    if (!first) return;
    analytics.capture(
      'user_active_day',
      { via: principal.via, days_since_signup: today - utcDay(user.created_at) },
      {
        userId: user.id,
        ...(principal.via === 'session' && principal.currentOrgId !== null ? { orgId: principal.currentOrgId } : {}),
      },
    );
  }

  async function cache(hashHex: string, value: CachedSession): Promise<void> {
    await redis.set(sessionKey(hashHex), JSON.stringify(value), 'EX', SESSION_CACHE_TTL_SECONDS);
    await redis.set(sessionIdKey(value.session_id), hashHex, 'EX', SESSION_CACHE_TTL_SECONDS);
    if (await redis.get(revokedKey(value.session_id))) {
      await redis.del(sessionKey(hashHex));
      await redis.del(sessionIdKey(value.session_id));
    }
  }

  async function read(hashHex: string): Promise<CachedSession | null> {
    const raw = await redis.get(sessionKey(hashHex));
    return raw ? (JSON.parse(raw) as CachedSession) : null;
  }

  async function resolveSession(token: string): Promise<Principal | null> {
    const hash = sha256(token);
    const hashHex = hash.toString('hex');

    let cached = await read(hashHex);
    if (!cached) {
      const row = await sessions.findLiveByTokenHash(ctx, hash);
      if (!row) return null;
      cached = {
        session_id: row.id,
        user_id: row.user_id,
        current_org_id: row.current_org_id,
        last_seen_at: row.last_seen_at.toISOString(),
      };
      await cache(hashHex, cached);
    }

    // Rolling expiry: an active user never logs in again — docs/auth-and-tenancy.md#rolling-expiry.
    if (Date.now() - Date.parse(cached.last_seen_at) > SESSION_ROLLING_REFRESH_MS) {
      const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
      await sessions.touch(ctx, cached.session_id, expiresAt);
      cached = { ...cached, last_seen_at: new Date().toISOString() };
      await cache(hashHex, cached);
    }

    const user = await users.findById(ctx, cached.user_id);
    if (!user || user.deactivated_at || user.deleted_at) {
      await invalidate(cached.session_id);
      return null;
    }

    const principal: Principal = {
      via: 'session',
      userId: cached.user_id,
      sessionId: cached.session_id,
      currentOrgId: cached.current_org_id,
    };
    await markActiveDay(user, principal);
    return principal;
  }

  async function resolvePat(token: string): Promise<Principal | null> {
    const row = await tokens.findLiveByTokenHash(ctx, sha256(token));
    if (!row) return null;

    const user = await users.findById(ctx, row.user_id);
    if (!user || user.deactivated_at || user.deleted_at) return null;

    await tokens.markUsed(ctx, row.id, PAT_LAST_USED_RESOLUTION_MS);
    const principal: Principal = {
      via: 'pat',
      userId: row.user_id,
      tokenId: row.id,
      scopes: row.scopes as PatScope[],
      projectIds: row.project_ids,
    };
    await markActiveDay(user, principal);
    return principal;
  }

  async function invalidate(sessionId: number): Promise<void> {
    await redis.set(revokedKey(sessionId), '1', 'EX', SESSION_CACHE_TTL_SECONDS);
    const hashHex = await redis.get(sessionIdKey(sessionId));
    if (hashHex) await redis.del(sessionKey(hashHex));
    await redis.del(sessionIdKey(sessionId));
  }

  return {
    async resolvePrincipal(credential: Credential): Promise<Principal | null> {
      return credential.kind === 'session' ? resolveSession(credential.token) : resolvePat(credential.token);
    },

    invalidate,

    async invalidateMany(sessionIds: number[]): Promise<void> {
      await Promise.all(sessionIds.map(invalidate));
    },
  };
}

export type AuthService = ReturnType<typeof authService>;
