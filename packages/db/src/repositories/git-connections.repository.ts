import { and, asc, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import type { GitConnectionStatus } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import { git_connections, type GitConnectionRow, type NewGitConnectionRow } from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export type GitConnectionInsert = Omit<NewGitConnectionRow, 'id' | 'org_id'>;
export type GitConnectionPatch = Partial<
  Pick<
    GitConnectionRow,
    | 'account_login'
    | 'account_avatar_url'
    | 'account_url'
    | 'token_ciphertext'
    | 'hook_id_hash'
    | 'hook_secret_ciphertext'
    | 'status'
    | 'last_error'
    | 'token_expires_at'
    | 'token_warned_at'
  >
>;

export function gitConnectionsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(git_connections.org_id, ctx.orgId);
  const live = isNull(git_connections.revoked_at);

  return {
    async insert(ctx: TenantContext, input: GitConnectionInsert): Promise<GitConnectionRow> {
      const [row] = await db
        .insert(git_connections)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      return row!;
    },

    async findById(ctx: TenantContext, id: number): Promise<GitConnectionRow | undefined> {
      const [row] = await db
        .select()
        .from(git_connections)
        .where(and(inOrg(ctx), eq(git_connections.id, id)));
      return row;
    },

    /** Live connections first, oldest first; disconnected ones only when asked for. */
    async list(ctx: TenantContext, opts: { includeRevoked?: boolean } = {}): Promise<GitConnectionRow[]> {
      return db
        .select()
        .from(git_connections)
        .where(opts.includeRevoked ? inOrg(ctx) : and(inOrg(ctx), live))
        .orderBy(sql`${git_connections.revoked_at} is not null`, asc(git_connections.id));
    },

    async countLive(ctx: TenantContext): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(git_connections)
        .where(and(inOrg(ctx), live));
      return row?.n ?? 0;
    },

    async update(
      ctx: TenantContext,
      id: number,
      patch: GitConnectionPatch,
      at: Date,
    ): Promise<GitConnectionRow | undefined> {
      const [row] = await db
        .update(git_connections)
        .set({ ...patch, updated_at: at })
        .where(and(inOrg(ctx), eq(git_connections.id, id), live))
        .returning();
      return row;
    },

    /**
     * Moves a live connection to `status` only from one of `from`: the call that flips it gets the
     * row back, so the email for a transition goes out once.
     */
    async transition(
      ctx: TenantContext,
      id: number,
      from: readonly GitConnectionStatus[],
      patch: GitConnectionPatch & { status: GitConnectionStatus },
      at: Date,
    ): Promise<GitConnectionRow | undefined> {
      const [row] = await db
        .update(git_connections)
        .set({ ...patch, updated_at: at })
        .where(and(inOrg(ctx), eq(git_connections.id, id), live, inArray(git_connections.status, [...from])))
        .returning();
      return row;
    },

    /** Forgets the credentials; the row stays so its repositories and history keep their attribution. */
    async revoke(
      ctx: TenantContext,
      id: number,
      at: Date,
      lastError: GitConnectionRow['last_error'] = null,
    ): Promise<GitConnectionRow | undefined> {
      const [row] = await db
        .update(git_connections)
        .set({
          status: 'revoked',
          last_error: lastError,
          token_ciphertext: null,
          hook_id_hash: null,
          hook_secret_ciphertext: null,
          revoked_at: at,
          updated_at: at,
        })
        .where(and(inOrg(ctx), eq(git_connections.id, id), live))
        .returning();
      return row;
    },

    async touch(ctx: TenantContext, id: number, at: Date): Promise<void> {
      await db
        .update(git_connections)
        .set({ last_event_at: at })
        .where(and(inOrg(ctx), eq(git_connections.id, id)));
    },

    /** A delivery to a hook URL names no organisation: the hook id's hash is how it finds one. */
    async findByHookHash(_ctx: SystemContext, hash: Buffer): Promise<GitConnectionRow | undefined> {
      const [row] = await db
        .select()
        .from(git_connections)
        .where(and(eq(git_connections.hook_id_hash, hash), live));
      return row;
    },

    /** An app delivery names its installation: every organisation that connected it gets the delivery. */
    async listByInstallation(
      _ctx: SystemContext,
      provider: string,
      baseUrl: string,
      installationId: string,
    ): Promise<GitConnectionRow[]> {
      return db
        .select()
        .from(git_connections)
        .where(
          and(
            eq(git_connections.provider, provider),
            eq(git_connections.base_url, baseUrl),
            eq(git_connections.installation_id, installationId),
            live,
          ),
        )
        .orderBy(asc(git_connections.id));
    },

    async findByInstallation(
      ctx: TenantContext,
      provider: string,
      baseUrl: string,
      installationId: string,
    ): Promise<GitConnectionRow | undefined> {
      const [row] = await db
        .select()
        .from(git_connections)
        .where(
          and(
            inOrg(ctx),
            eq(git_connections.provider, provider),
            eq(git_connections.base_url, baseUrl),
            eq(git_connections.installation_id, installationId),
            live,
          ),
        );
      return row;
    },

    /**
     * The connection, if it may still feed issues (live, not suspended), held until the caller's
     * transaction ends: a disconnect or suspension waits for it, or it sees theirs.
     */
    async lockEligible(ctx: TenantContext, id: number): Promise<GitConnectionRow | undefined> {
      const [row] = await db
        .select()
        .from(git_connections)
        .where(and(inOrg(ctx), eq(git_connections.id, id), live, ne(git_connections.status, 'suspended')))
        .for('share');
      return row;
    },

    /** Stamps the expiry warning once: only the call that stamps it gets the row, so one email goes out. */
    async markWarned(ctx: TenantContext, id: number, at: Date): Promise<GitConnectionRow | undefined> {
      const [row] = await db
        .update(git_connections)
        .set({ token_warned_at: at })
        .where(and(inOrg(ctx), eq(git_connections.id, id), live, isNull(git_connections.token_warned_at)))
        .returning();
      return row;
    },

    /** Live connections whose token expires before `before`, across organisations. */
    async expiringAll(_ctx: SystemContext, before: Date): Promise<GitConnectionRow[]> {
      return db
        .select()
        .from(git_connections)
        .where(and(live, lte(git_connections.token_expires_at, before)))
        .orderBy(asc(git_connections.id));
    },

    /** Every live connection, across organisations, for the nightly jobs. */
    async listLiveAll(_ctx: SystemContext): Promise<GitConnectionRow[]> {
      return db.select().from(git_connections).where(live).orderBy(asc(git_connections.id));
    },
  };
}

export type GitConnectionsRepository = ReturnType<typeof gitConnectionsRepository>;
