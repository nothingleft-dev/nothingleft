import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  automation_runs,
  automations,
  type AutomationRow,
  type AutomationRunRow,
  type NewAutomationRow,
  type NewAutomationRunRow,
} from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export type AutomationInsert = Omit<NewAutomationRow, 'id' | 'org_id'>;
export type AutomationPatch = Partial<
  Pick<AutomationRow, 'name' | 'trigger' | 'conditions' | 'action' | 'action_params' | 'is_enabled' | 'position'>
> & { updated_by: number; updated_at: Date };

export interface RunStats {
  automation_id: number;
  runs: number;
  last_run_at: Date | null;
}

export function automationsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(automations.org_id, ctx.orgId);

  return {
    async insert(ctx: TenantContext, input: AutomationInsert): Promise<AutomationRow> {
      const [row] = await db
        .insert(automations)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      return row!;
    },

    /** The project's rules in the order they are evaluated. */
    async listForProject(ctx: TenantContext, projectId: number): Promise<AutomationRow[]> {
      return db
        .select()
        .from(automations)
        .where(and(inOrg(ctx), eq(automations.project_id, projectId)))
        .orderBy(asc(automations.position), asc(automations.id));
    },

    /** The enabled rules of one trigger across these projects, in evaluation order. */
    async enabledFor(ctx: TenantContext, projectIds: readonly number[], trigger: string): Promise<AutomationRow[]> {
      if (projectIds.length === 0) return [];
      return db
        .select()
        .from(automations)
        .where(
          and(
            inOrg(ctx),
            inArray(automations.project_id, [...projectIds]),
            eq(automations.trigger, trigger),
            eq(automations.is_enabled, true),
          ),
        )
        .orderBy(asc(automations.position), asc(automations.id));
    },

    async findById(ctx: TenantContext, id: number): Promise<AutomationRow | undefined> {
      const [row] = await db
        .select()
        .from(automations)
        .where(and(inOrg(ctx), eq(automations.id, id)));
      return row;
    },

    async findByName(ctx: TenantContext, projectId: number, name: string): Promise<AutomationRow | undefined> {
      const [row] = await db
        .select()
        .from(automations)
        .where(
          and(inOrg(ctx), eq(automations.project_id, projectId), sql`lower(${automations.name}) = lower(${name})`),
        );
      return row;
    },

    async countForProject(ctx: TenantContext, projectId: number): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(automations)
        .where(and(inOrg(ctx), eq(automations.project_id, projectId)));
      return row?.n ?? 0;
    },

    async update(ctx: TenantContext, id: number, patch: AutomationPatch): Promise<AutomationRow | undefined> {
      const [row] = await db
        .update(automations)
        .set(patch)
        .where(and(inOrg(ctx), eq(automations.id, id)))
        .returning();
      return row;
    },

    async remove(ctx: TenantContext, id: number): Promise<AutomationRow | undefined> {
      const [row] = await db
        .delete(automations)
        .where(and(inOrg(ctx), eq(automations.id, id)))
        .returning();
      return row;
    },

    /** A status renamed in the project: every rule that sets it follows, so none is left pointing nowhere. */
    async renameStatus(ctx: TenantContext, projectId: number, from: string, to: string, at: Date): Promise<number> {
      const rows = await db
        .update(automations)
        .set({
          action_params: sql`jsonb_set(${automations.action_params}, '{status}', to_jsonb(${to}::text))`,
          updated_at: at,
        })
        .where(
          and(
            inOrg(ctx),
            eq(automations.project_id, projectId),
            eq(automations.action, 'issue.set_status'),
            sql`lower(${automations.action_params} ->> 'status') = lower(${from})`,
          ),
        )
        .returning({ id: automations.id });
      return rows.length;
    },

    async recordRun(ctx: TenantContext, input: Omit<NewAutomationRunRow, 'id' | 'org_id'>): Promise<AutomationRunRow> {
      const [row] = await db
        .insert(automation_runs)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      return row!;
    },

    async runsByIds(ctx: TenantContext, ids: readonly number[]): Promise<AutomationRunRow[]> {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(automation_runs)
        .where(and(eq(automation_runs.org_id, ctx.orgId), inArray(automation_runs.id, [...ids])));
    },

    /** Newest first, of the given rules, optionally on one issue. */
    async listRuns(
      ctx: TenantContext,
      filter: { automationIds: readonly number[]; issueId?: number },
      page: { limit: number; offset: number },
    ): Promise<{ rows: AutomationRunRow[]; total: number }> {
      if (filter.automationIds.length === 0) return { rows: [], total: 0 };
      const where = and(
        eq(automation_runs.org_id, ctx.orgId),
        inArray(automation_runs.automation_id, [...filter.automationIds]),
        filter.issueId === undefined ? undefined : eq(automation_runs.issue_id, filter.issueId),
      );
      const [rows, [total]] = await Promise.all([
        db
          .select()
          .from(automation_runs)
          .where(where)
          .orderBy(desc(automation_runs.id))
          .limit(page.limit)
          .offset(page.offset),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(automation_runs)
          .where(where),
      ]);
      return { rows, total: total?.n ?? 0 };
    },

    async runStats(ctx: TenantContext, automationIds: readonly number[], since: Date): Promise<RunStats[]> {
      if (automationIds.length === 0) return [];
      return db
        .select({
          automation_id: automation_runs.automation_id,
          runs: sql<number>`count(*)::int`,
          last_run_at: sql<Date | null>`max(${automation_runs.created_at})`,
        })
        .from(automation_runs)
        .where(
          and(
            eq(automation_runs.org_id, ctx.orgId),
            inArray(automation_runs.automation_id, [...automationIds]),
            gte(automation_runs.created_at, since),
          ),
        )
        .groupBy(automation_runs.automation_id);
    },

    /** Runs older than `before`, across organisations; history rows keep their own snapshot. */
    async purgeRuns(_ctx: SystemContext, before: Date, limit: number): Promise<number> {
      const victims = db
        .select({ id: automation_runs.id })
        .from(automation_runs)
        .where(lt(automation_runs.created_at, before))
        .limit(limit);
      const rows = await db
        .delete(automation_runs)
        .where(inArray(automation_runs.id, victims))
        .returning({ id: automation_runs.id });
      return rows.length;
    },
  };
}

export type AutomationsRepository = ReturnType<typeof automationsRepository>;
