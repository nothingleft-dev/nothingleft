import { and, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type { ExportStatus } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import { export_jobs, type ExportJobRow } from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export type ExportJobPatch = Partial<
  Pick<
    ExportJobRow,
    | 'status'
    | 'object_key'
    | 'size_bytes'
    | 'file_count'
    | 'missing_file_count'
    | 'expires_at'
    | 'error'
    | 'started_at'
    | 'completed_at'
  >
>;

const PENDING: ExportStatus[] = ['queued', 'running'];

export function exportJobsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(export_jobs.org_id, ctx.orgId);

  return {
    /** Undefined when one is already queued or running: an organisation has at most one at a time. */
    async insertPending(ctx: TenantContext, createdBy: number): Promise<ExportJobRow | undefined> {
      const [row] = await db
        .insert(export_jobs)
        .values({ org_id: ctx.orgId, created_by: createdBy })
        .onConflictDoNothing()
        .returning();
      return row;
    },

    async findPending(ctx: TenantContext): Promise<ExportJobRow | undefined> {
      const [row] = await db
        .select()
        .from(export_jobs)
        .where(and(inOrg(ctx), inArray(export_jobs.status, PENDING)));
      return row;
    },

    async find(ctx: TenantContext, id: number): Promise<ExportJobRow | undefined> {
      const [row] = await db
        .select()
        .from(export_jobs)
        .where(and(inOrg(ctx), eq(export_jobs.id, id)));
      return row;
    },

    async list(ctx: TenantContext, limit: number): Promise<ExportJobRow[]> {
      return db.select().from(export_jobs).where(inOrg(ctx)).orderBy(desc(export_jobs.id)).limit(limit);
    },

    async transition(
      ctx: TenantContext,
      id: number,
      from: readonly ExportStatus[],
      patch: ExportJobPatch & { status: ExportStatus },
    ): Promise<ExportJobRow | undefined> {
      const [row] = await db
        .update(export_jobs)
        .set({ ...patch, updated_at: sql`now()` })
        .where(and(inOrg(ctx), eq(export_jobs.id, id), inArray(export_jobs.status, [...from])))
        .returning();
      return row;
    },

    async listExpired(
      _ctx: SystemContext,
      now: Date,
      limit: number,
    ): Promise<Pick<ExportJobRow, 'id' | 'org_id' | 'object_key'>[]> {
      return db
        .select({ id: export_jobs.id, org_id: export_jobs.org_id, object_key: export_jobs.object_key })
        .from(export_jobs)
        .where(and(eq(export_jobs.status, 'completed'), lt(export_jobs.expires_at, now)))
        .orderBy(export_jobs.id)
        .limit(limit);
    },

    async objectKeys(ctx: TenantContext): Promise<string[]> {
      const rows = await db
        .select({ key: export_jobs.object_key })
        .from(export_jobs)
        .where(and(inOrg(ctx), isNotNull(export_jobs.object_key)));
      return rows.map(r => r.key!);
    },
  };
}

export type ExportJobsRepository = ReturnType<typeof exportJobsRepository>;
