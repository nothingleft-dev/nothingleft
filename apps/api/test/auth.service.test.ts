import { describe, expect, test } from 'bun:test';
import { noopAnalytics } from '@nothingleft/analytics';
import type { SessionRow, UserRow } from '@nothingleft/db';
import { PAT_LAST_USED_RESOLUTION_MS, SESSION_ROLLING_REFRESH_MS } from '@config/constants';
import { sha256 } from '@lib/crypto';
import { authService, type AuthDeps, type SessionCache } from '@services/auth.service';

type Step = 'read' | 'touch';

/** A session store whose next read or touch can be held, to interleave a revocation with a lookup. */
function harness() {
  const store = new Map<string, string>();
  const redis: SessionCache = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, _mode: 'EX', _ttl: number, flag?: 'NX') {
      if (flag === 'NX' && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      store.delete(key);
    },
  };

  const rows: SessionRow[] = [];
  const holds = new Map<Step, { arrive: () => void; released: Promise<void> }>();
  const pass = async (step: Step) => {
    const held = holds.get(step);
    if (!held) return;
    holds.delete(step);
    held.arrive();
    await held.released;
  };

  const sessions = {
    async findLiveByTokenHash(_c: unknown, hash: Buffer) {
      const row = rows.find(r => r.token_hash.equals(hash));
      await pass('read');
      return row;
    },
    async touch(_c: unknown, id: number, expiresAt: Date) {
      await pass('touch');
      const row = rows.find(r => r.id === id);
      if (row) row.expires_at = expiresAt;
    },
  };
  const users = {
    async findById(_c: unknown, id: number) {
      return { id, deactivated_at: null, deleted_at: null, created_at: new Date() } as UserRow;
    },
  };

  const auth = authService({
    users: users as unknown as AuthDeps['users'],
    sessions: sessions as unknown as AuthDeps['sessions'],
    tokens: {} as AuthDeps['tokens'],
    redis,
    analytics: noopAnalytics,
  });

  return {
    auth,
    rows,
    hold(step: Step) {
      let arrive!: () => void;
      let release!: () => void;
      const arrived = new Promise<void>(resolve => (arrive = resolve));
      const released = new Promise<void>(resolve => (release = resolve));
      holds.set(step, { arrive, released });
      return { arrived, release };
    },
    addSession(id: number, token: string, lastSeen = new Date()) {
      rows.push({
        id,
        token_hash: sha256(token),
        user_id: 7,
        current_org_id: null,
        user_agent: null,
        ip: null,
        country_code: null,
        created_at: lastSeen,
        last_seen_at: lastSeen,
        expires_at: new Date(Date.now() + 86_400_000),
      });
    },
    revoke(id: number) {
      rows.splice(
        rows.findIndex(r => r.id === id),
        1,
      );
    },
    isCached: (token: string) => store.has(`sess:${sha256(token).toString('hex')}`),
  };
}

const lookup = (auth: ReturnType<typeof harness>['auth'], token: string) =>
  auth.resolvePrincipal({ kind: 'session', token });

describe('the session cache', () => {
  test('a lookup that read the row before a revocation cannot cache it after', async () => {
    const { auth, hold, addSession, revoke, isCached } = harness();
    addSession(41, 'token-41');

    const read = hold('read');
    const inFlight = lookup(auth, 'token-41');
    await read.arrived;
    revoke(41);
    await auth.invalidate(41);
    read.release();
    await inFlight;

    expect(isCached('token-41')).toBe(false);
    expect(await lookup(auth, 'token-41')).toBeNull();
  });

  test('the rolling refresh cannot re-cache a session revoked while it ran', async () => {
    const { auth, hold, addSession, revoke, isCached } = harness();
    addSession(42, 'token-42', new Date(Date.now() - SESSION_ROLLING_REFRESH_MS - 60_000));

    const touch = hold('touch');
    const inFlight = lookup(auth, 'token-42');
    await touch.arrived;
    revoke(42);
    await auth.invalidateMany([42]);
    touch.release();
    await inFlight;

    expect(isCached('token-42')).toBe(false);
    expect(await lookup(auth, 'token-42')).toBeNull();
  });

  test('refreshing a live session after an organisation switch keeps it signed in on the new organisation', async () => {
    const { auth, rows, addSession } = harness();
    addSession(43, 'token-43');
    expect(await lookup(auth, 'token-43')).toMatchObject({ sessionId: 43, currentOrgId: null });

    rows[0]!.current_org_id = 9;
    await auth.invalidate(43);

    expect(await lookup(auth, 'token-43')).toMatchObject({ sessionId: 43, currentOrgId: 9 });
    expect(await lookup(auth, 'token-43')).toMatchObject({ sessionId: 43, currentOrgId: 9 });
  });
});

describe('personal access token lookup', () => {
  test('stamps last_used_at through the five-minute resolution', async () => {
    const marked: { id: number; resolutionMs: number }[] = [];
    const row = { id: 3, user_id: 7, scopes: ['issues:read'], project_ids: null };
    const auth = authService({
      users: {
        findById: async (_c: unknown, id: number) => ({
          id,
          deactivated_at: null,
          deleted_at: null,
          created_at: new Date(),
        }),
      } as unknown as AuthDeps['users'],
      sessions: {} as AuthDeps['sessions'],
      tokens: {
        findLiveByTokenHash: async () => row,
        markUsed: async (_c: unknown, id: number, resolutionMs: number) => void marked.push({ id, resolutionMs }),
      } as unknown as AuthDeps['tokens'],
      redis: { get: async () => null, set: async () => 'OK', del: async () => {} },
      analytics: noopAnalytics,
    });

    expect(await auth.resolvePrincipal({ kind: 'pat', token: 'nl_pat_x' })).toMatchObject({ via: 'pat', tokenId: 3 });
    expect(marked).toEqual([{ id: 3, resolutionMs: PAT_LAST_USED_RESOLUTION_MS }]);
  });
});
