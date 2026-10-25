import { and, asc, desc, eq, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { GitEventStatus } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import { git_webhook_events, type GitWebhookEventRow, type NewGitWebhookEventRow } from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export type GitEventInsert = Pick<
  NewGitWebhookEventRow,
  'connection_id' | 'repository_id' | 'provider_repo_id' | 'delivery_id' | 'event_name' | 'payload' | 'truncated'
> & { received_at: Date };

export interface GitEventFilter {
  connectionIds?: readonly number[];
  repositoryIds?: readonly number[];
  status?: GitEventStatus;
}

/** The events one drain run applies: those of one repository, or of a connection with no repository. */
export interface GitEventQueueKey {
  connection_id: number;
  provider_repo_id: string | null;
}

export function gitEventsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(git_webhook_events.org_id, ctx.orgId);
  const ofKey = (key: GitEventQueueKey) =>
    and(
      eq(git_webhook_events.connection_id, key.connection_id),
      key.provider_repo_id === null
        ? isNull(git_webhook_events.provider_repo_id)
        : eq(git_webhook_events.provider_repo_id, key.provider_repo_id),
    );

  function filtered(ctx: TenantContext, filter: GitEventFilter): SQL {
    const parts: SQL[] = [inOrg(ctx)];
    if (filter.connectionIds) parts.push(inArray(git_webhook_events.connection_id, [...filter.connectionIds]));
    if (filter.repositoryIds) parts.push(inArray(git_webhook_events.repository_id, [...filter.repositoryIds]));
    if (filter.status) parts.push(eq(git_webhook_events.status, filter.status));
    return and(...parts)!;
  }

  return {
    /** A delivery already stored (the provider retried it) inserts nothing and returns undefined. */
    async insert(ctx: TenantContext, input: GitEventInsert): Promise<GitWebhookEventRow | undefined> {
      const [row] = await db
        .insert(git_webhook_events)
        .values({ ...input, org_id: ctx.orgId })
        .onConflictDoNothing({ target: [git_webhook_events.connection_id, git_webhook_events.delivery_id] })
        .returning();
      return row;
    },

    async find(ctx: TenantContext, id: number): Promise<GitWebhookEventRow | undefined> {
      const [row] = await db
        .select()
        .from(git_webhook_events)
        .where(and(inOrg(ctx), eq(git_webhook_events.id, id)));
      return row;
    },

    /** The oldest event of that key still to apply: a drain applies them in the order received. */
    async nextPending(ctx: TenantContext, key: GitEventQueueKey): Promise<GitWebhookEventRow | undefined> {
      const [row] = await db
        .select()
        .from(git_webhook_events)
        .where(and(inOrg(ctx), ofKey(key), eq(git_webhook_events.status, 'pending')))
        .orderBy(asc(git_webhook_events.id))
        .limit(1);
      return row;
    },

    async finish(
      ctx: TenantContext,
      id: number,
      outcome: { status: Exclude<GitEventStatus, 'pending'>; error: string | null; repository_id?: number | null },
      at: Date,
    ): Promise<GitWebhookEventRow | undefined> {
      const [row] = await db
        .update(git_webhook_events)
        .set({ ...outcome, processed_at: at, next_attempt_at: null })
        .where(and(inOrg(ctx), eq(git_webhook_events.id, id)))
        .returning();
      return row;
    },

    /** A failed attempt that will be retried: the event stays pending and the drain waits for it. */
    async retryLater(
      ctx: TenantContext,
      id: number,
      error: string,
      nextAttemptAt: Date,
    ): Promise<GitWebhookEventRow | undefined> {
      const [row] = await db
        .update(git_webhook_events)
        .set({ attempts: sql`${git_webhook_events.attempts} + 1`, error, next_attempt_at: nextAttemptAt })
        .where(and(inOrg(ctx), eq(git_webhook_events.id, id)))
        .returning();
      return row;
    },

    async list(
      ctx: TenantContext,
      filter: GitEventFilter,
      page: { limit: number; offset: number },
    ): Promise<{ rows: GitWebhookEventRow[]; total: number }> {
      const where = filtered(ctx, filter);
      const [rows, [total]] = await Promise.all([
        db
          .select()
          .from(git_webhook_events)
          .where(where)
          .orderBy(desc(git_webhook_events.id))
          .limit(page.limit)
          .offset(page.offset),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(git_webhook_events)
          .where(where),
      ]);
      return { rows, total: total?.n ?? 0 };
    },

    /** Back to pending with a clean slate; the drain applies it again in order. */
    async resetForReplay(
      ctx: TenantContext,
      id: number,
      runAutomations: boolean,
    ): Promise<GitWebhookEventRow | undefined> {
      const [row] = await db
        .update(git_webhook_events)
        .set({
          status: 'pending',
          processed_at: null,
          error: null,
          attempts: 0,
          next_attempt_at: null,
          run_automations: runAutomations,
        })
        .where(and(inOrg(ctx), eq(git_webhook_events.id, id)))
        .returning();
      return row;
    },

    /** Deletes events received before `before`, a batch at a time, across organisations. */
    async purgeBefore(_ctx: SystemContext, before: Date, limit: number): Promise<number> {
      const victims = db
        .select({ id: git_webhook_events.id })
        .from(git_webhook_events)
        .where(lt(git_webhook_events.received_at, before))
        .limit(limit);
      const rows = await db
        .delete(git_webhook_events)
        .where(inArray(git_webhook_events.id, victims))
        .returning({ id: git_webhook_events.id });
      return rows.length;
    },
  };
}

export type GitEventsRepository = ReturnType<typeof gitEventsRepository>;
