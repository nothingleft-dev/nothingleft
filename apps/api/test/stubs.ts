import { noopAnalytics } from '@nothingleft/analytics';
import type {
  NewOneTimeTokenRow,
  NewPersonalAccessTokenRow,
  NewSessionRow,
  NewUserRow,
  OneTimeTokenRow,
  PersonalAccessTokenRow,
  SessionRow,
  TotpRecoveryCodeRow,
  UserPreferencesRow,
  UserRow,
} from '@nothingleft/db';
import type { Message } from '@lib/email';
import type { AccountsDeps, TransactionalRepos } from '@services/accounts.service';

/** Hand-written stores, not database mocks - docs/backend-guide.md#testing. */
export function stubWorld() {
  const users: UserRow[] = [];
  const sessions: SessionRow[] = [];
  const oneTimeTokens: OneTimeTokenRow[] = [];
  const patTokens: PersonalAccessTokenRow[] = [];
  const recoveryCodes: TotpRecoveryCodeRow[] = [];
  const transactional: string[] = [];
  const preferences: UserPreferencesRow[] = [];
  const sent: Message[] = [];
  const counters = new Map<string, number>();
  const invalidated: number[] = [];
  let nextId = 1;

  const blank = (id: number): UserRow => ({
    id,
    email: '',
    email_verified_at: null,
    name: '',
    avatar_url: null,
    avatar_object_key: null,
    password_hash: null,
    google_id: null,
    github_id: null,
    timezone: 'UTC',
    country_code: null,
    last_login_at: null,
    last_login_ip: null,
    totp_secret_ciphertext: null,
    totp_enabled_at: null,
    totp_last_used_step: null,
    deactivated_at: null,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const usersRepo = {
    async findById(_c: unknown, id: number) {
      return users.find(u => u.id === id);
    },
    async findByEmail(_c: unknown, email: string) {
      return users.find(u => u.email.toLowerCase() === email.toLowerCase());
    },
    async findByProviderId(_c: unknown, provider: 'google' | 'github', id: string) {
      return users.find(u => (provider === 'google' ? u.google_id : u.github_id) === id);
    },
    async create(_c: unknown, input: NewUserRow) {
      const row = { ...blank(nextId++), ...input } as UserRow;
      users.push(row);
      return row;
    },
    async update(_c: unknown, id: number, patch: Partial<NewUserRow>) {
      const row = users.find(u => u.id === id);
      if (!row) return undefined;
      Object.assign(row, patch);
      return row;
    },
    async findMemberByUsername() {
      return undefined;
    },
    async listMembers() {
      return [];
    },
  };

  const sessionsRepo = {
    async create(_c: unknown, input: NewSessionRow) {
      const row = {
        id: nextId++,
        current_org_id: null,
        user_agent: null,
        ip: null,
        country_code: null,
        created_at: new Date(),
        last_seen_at: new Date(),
        ...input,
      } as SessionRow;
      sessions.push(row);
      return row;
    },
    async findLiveByTokenHash(_c: unknown, hash: Buffer) {
      return sessions.find(s => s.token_hash.equals(hash) && s.expires_at > new Date());
    },
    async touch(_c: unknown, id: number, expiresAt: Date) {
      const row = sessions.find(s => s.id === id);
      if (row) Object.assign(row, { expires_at: expiresAt, last_seen_at: new Date() });
    },
    async setCurrentOrg(_c: unknown, id: number, orgId: number | null) {
      const row = sessions.find(s => s.id === id);
      if (row) row.current_org_id = orgId;
    },
    async listForUser(_c: unknown, userId: number) {
      return sessions.filter(s => s.user_id === userId).map(session => ({ session, organization_slug: null }));
    },
    async findForUser(_c: unknown, userId: number, id: number) {
      return sessions.find(s => s.id === id && s.user_id === userId);
    },
    async deleteForUser(_c: unknown, userId: number, id: number) {
      const index = sessions.findIndex(s => s.id === id && s.user_id === userId);
      return index === -1 ? undefined : sessions.splice(index, 1)[0];
    },
    async deleteAllForUser(_c: unknown, userId: number, exceptId?: number) {
      const doomed = sessions.filter(s => s.user_id === userId && s.id !== exceptId);
      for (const row of doomed) sessions.splice(sessions.indexOf(row), 1);
      return doomed.map(r => ({ id: r.id }));
    },
    async deleteExpired() {
      return 0;
    },
  };

  const oneTimeTokensRepo = {
    async create(_c: unknown, input: NewOneTimeTokenRow) {
      const row = {
        id: nextId++,
        org_id: null,
        new_email: null,
        created_by: null,
        used_at: null,
        created_at: new Date(),
        ...input,
      } as OneTimeTokenRow;
      oneTimeTokens.push(row);
      return row;
    },
    async findUnused(_c: unknown, purpose: string, hash: Buffer) {
      return oneTimeTokens.find(t => t.purpose === purpose && t.token_hash.equals(hash) && t.used_at === null);
    },
    async consume(_c: unknown, id: number) {
      const row = oneTimeTokens.find(t => t.id === id && t.used_at === null);
      if (!row) return undefined;
      row.used_at = new Date();
      return row;
    },
    async deleteForUser(_c: unknown, userId: number, purpose: string) {
      for (const row of oneTimeTokens.filter(t => t.user_id === userId && t.purpose === purpose)) {
        oneTimeTokens.splice(oneTimeTokens.indexOf(row), 1);
      }
    },
    async deleteAllInvolving(_c: unknown, userId: number) {
      const doomed = oneTimeTokens.filter(t => t.used_at === null && (t.user_id === userId || t.created_by === userId));
      for (const row of doomed) oneTimeTokens.splice(oneTimeTokens.indexOf(row), 1);
      return doomed;
    },
    async deleteExpired() {
      return 0;
    },
  };

  const tokensRepo = {
    async create(_c: unknown, input: NewPersonalAccessTokenRow) {
      const row = {
        id: nextId++,
        restricted: false,
        expires_at: null,
        last_used_at: null,
        created_at: new Date(),
        revoked_at: null,
        ...input,
      } as PersonalAccessTokenRow;
      patTokens.push(row);
      return row;
    },
    async revokeAllForUser(_c: unknown, userId: number) {
      const live = patTokens.filter(t => t.user_id === userId && t.revoked_at === null);
      for (const row of live) row.revoked_at = new Date();
      return live;
    },
  };

  const recoveryCodesRepo = {
    async deleteUnused(_c: unknown, userId: number) {
      for (const row of recoveryCodes.filter(r => r.user_id === userId && r.used_at === null)) {
        recoveryCodes.splice(recoveryCodes.indexOf(row), 1);
      }
    },
  };

  /** Records each call made through the transaction's repositories, so a test can tell them from the pool's. */
  const inTx = <T extends object>(name: string, repo: T): T =>
    new Proxy(repo, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          transactional.push(`${name}.${String(key)}`);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });

  const preferencesRepo = {
    async create(_c: unknown, userId: number) {
      const row: UserPreferencesRow = { user_id: userId, theme: 'system', last_project_id: null, ui: {} };
      preferences.push(row);
      return row;
    },
    async findForUser(_c: unknown, userId: number) {
      const row = preferences.find(p => p.user_id === userId);
      return row ? { preferences: row, last_project_key: null } : undefined;
    },
    async update(_c: unknown, userId: number, patch: Partial<UserPreferencesRow>) {
      const row = preferences.find(p => p.user_id === userId);
      if (!row) return undefined;
      Object.assign(row, patch);
      return row;
    },
  };

  const redis = {
    async get(key: string) {
      const value = counters.get(key);
      return value === undefined ? null : String(value);
    },
    async set() {},
    async del(key: string) {
      counters.delete(key);
    },
    async incr(key: string) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async expire() {},
  };

  const auth = {
    async resolvePrincipal() {
      return null;
    },
    async invalidate(id: number) {
      invalidated.push(id);
    },
    async invalidateMany(ids: number[]) {
      invalidated.push(...ids);
    },
  };

  const deps: AccountsDeps = {
    inTransaction: body =>
      body({
        users: inTx('users', usersRepo) as unknown as TransactionalRepos['users'],
        preferences: inTx('preferences', preferencesRepo) as unknown as TransactionalRepos['preferences'],
        sessions: inTx('sessions', sessionsRepo) as unknown as TransactionalRepos['sessions'],
        tokens: inTx('tokens', tokensRepo) as unknown as TransactionalRepos['tokens'],
        oneTimeTokens: inTx('oneTimeTokens', oneTimeTokensRepo) as unknown as TransactionalRepos['oneTimeTokens'],
        recoveryCodes: inTx('recoveryCodes', recoveryCodesRepo) as unknown as TransactionalRepos['recoveryCodes'],
      }),
    isPasswordBreached: async () => false,
    resolveAvatarUrl: async ({ name, providerUrl }) =>
      providerUrl ?? `https://api.dicebear.com/10.x/initials/svg?seed=${name}`,
    users: usersRepo as unknown as AccountsDeps['users'],
    sessions: sessionsRepo as unknown as AccountsDeps['sessions'],
    oneTimeTokens: oneTimeTokensRepo as unknown as AccountsDeps['oneTimeTokens'],
    auth: auth as unknown as AccountsDeps['auth'],
    // Two-factor has its own route tests; these accounts never turn it on.
    twoFactor: { isEnabled: () => false } as unknown as AccountsDeps['twoFactor'],
    mirrorAvatar: async () => {},
    mailer: {
      async send(message) {
        sent.push(message);
      },
    },
    analytics: noopAnalytics,
    redis,
    appBaseUrl: 'http://localhost:3000',
    invitationProvesEmail: async () => false,
    defaultOrganization: async () => null,
  };

  /** The raw one-time token is only ever in the email body; tests read it back from there. */
  const tokenFromLastEmail = () => /token=([^\s&]+)/.exec(sent.at(-1)?.params?.['url'] as string)?.[1] ?? '';

  // The repositories are exposed as well, so a test can seed through them and a change
  // to one service's dependency shape does not ripple into every other test.
  const repos = {
    users: usersRepo as unknown as AccountsDeps['users'],
    sessions: sessionsRepo as unknown as AccountsDeps['sessions'],
    oneTimeTokens: oneTimeTokensRepo as unknown as AccountsDeps['oneTimeTokens'],
    preferences: preferencesRepo as unknown as TransactionalRepos['preferences'],
    tokens: tokensRepo as unknown as TransactionalRepos['tokens'],
  };

  return {
    deps,
    repos,
    state: {
      users,
      sessions,
      oneTimeTokens,
      patTokens,
      recoveryCodes,
      transactional,
      preferences,
      sent,
      counters,
      invalidated,
    },
    tokenFromLastEmail,
  };
}
