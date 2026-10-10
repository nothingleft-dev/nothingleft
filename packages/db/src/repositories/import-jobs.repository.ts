import { and, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type { ImportStatus } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import { import_jobs, type ImportJobRow, type NewImportJobRow } from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export type ImportJobInsert = Omit<NewImportJobRow, 'id' | 'org_id'>;
export type ImportJobPatch = Partial<
  Pick<
    ImportJobRow,
    | 'object_key'
    | 'status'
    | 'headers'
    | 'column_mapping'
    | 'total_rows'
    | 'processed_rows'
    | 'created_issues'
    | 'failed_rows'
    | 'errors'
    | 'error'
    | 'started_at'
    | 'completed_at'
  >
>;

export function importJobsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(import_jobs.org_id, ctx.orgId);

  return {
    async insert(ctx: TenantContext, input: ImportJobInsert): Promise<ImportJobRow> {
      const [row] = await db
        .insert(import_jobs)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      return row!;
    },

    async find(ctx: TenantContext, projectId: number, id: number): Promise<ImportJobRow | undefined> {
      const [row] = await db
        .select()
        .from(import_jobs)
        .where(and(inOrg(ctx), eq(import_jobs.project_id, projectId), eq(import_jobs.id, id)));
      return row;
    },

    async findById(ctx: TenantContext, id: number): Promise<ImportJobRow | undefined> {
      const [row] = await db
        .select()
        .from(import_jobs)
        .where(and(inOrg(ctx), eq(import_jobs.id, id)));
      return row;
    },

    async list(ctx: TenantContext, projectId: number, limit: number): Promise<ImportJobRow[]> {
      return db
        .select()
        .from(import_jobs)
        .where(and(inOrg(ctx), eq(import_jobs.project_id, projectId)))
        .orderBy(desc(import_jobs.id))
        .limit(limit);
    },

    async update(ctx: TenantContext, id: number, patch: ImportJobPatch): Promise<ImportJobRow | undefined> {
      const [row] = await db
        .update(import_jobs)
        .set({ ...patch, updated_at: sql`now()` })
        .where(and(inOrg(ctx), eq(import_jobs.id, id)))
        .returning();
      return row;
    },

    /** Moves the job on only from one of `from`, so two requests can never both start it. */
    async transition(
      ctx: TenantContext,
      id: number,
      from: readonly ImportStatus[],
      patch: ImportJobPatch & { status: ImportStatus },
    ): Promise<ImportJobRow | undefined> {
      const [row] = await db
        .update(import_jobs)
        .set({ ...patch, updated_at: sql`now()` })
        .where(and(inOrg(ctx), eq(import_jobs.id, id), inArray(import_jobs.status, [...from])))
        .returning();
      return row;
    },

    /** Files still held by a job nobody ran, or by one that ended before its file was deleted. */
    async listSweepable(
      _ctx: SystemContext,
      abandonedBefore: Date,
      limit: number,
    ): Promise<Pick<ImportJobRow, 'id' | 'org_id' | 'status' | 'object_key'>[]> {
      return db
        .select({
          id: import_jobs.id,
          org_id: import_jobs.org_id,
          status: import_jobs.status,
          object_key: import_jobs.object_key,
        })
        .from(import_jobs)
        .where(
          and(
            isNotNull(import_jobs.object_key),
            sql`(${import_jobs.status} in ('completed', 'failed', 'expired') or (${import_jobs.status} in ('awaiting_upload', 'ready') and ${lt(import_jobs.updated_at, abandonedBefore)}))`,
          ),
        )
        .orderBy(import_jobs.id)
        .limit(limit);
    },

    async objectKeys(ctx: TenantContext): Promise<string[]> {
      const rows = await db
        .select({ key: import_jobs.object_key })
        .from(import_jobs)
        .where(and(inOrg(ctx), isNotNull(import_jobs.object_key)));
      return rows.map(r => r.key!);
    },
  };
}

export type ImportJobsRepository = ReturnType<typeof importJobsRepository>;
