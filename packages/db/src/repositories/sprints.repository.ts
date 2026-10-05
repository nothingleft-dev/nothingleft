import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import {
  sprint_snapshots,
  sprints,
  type NewSprintRow,
  type SprintRow,
  type SprintSnapshotRow,
} from '../schema/index.ts';
import { effectiveEstimate } from '../search/issue-query.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

export type SprintPatch = Partial<
  Pick<
    NewSprintRow,
    'name' | 'slug' | 'goal_md' | 'start_date' | 'end_date' | 'state' | 'started_at' | 'completed_at' | 'updated_at'
  >
>;

export interface SprintFigures {
  sprint_id: number;
  issues: number;
  resolved_issues: number;
  points: number;
  resolved_points: number;
  remaining_estimate_minutes: number;
  mine_issues: number;
  mine_resolved_issues: number;
}

type Rows<T> = { rows: T[] };

const resolved = sql`s.category in ('done', 'cancelled')`;

// What a snapshot stores, over the sprint's live issues.
const snapshotFigures = (ctx: TenantContext) => sql`
  coalesce(sum(i.story_points), 0)::int as total_points,
  coalesce(sum(i.story_points) filter (where ${resolved}), 0)::int as completed_points,
  count(i.id)::int as total_issues,
  count(i.id) filter (where ${resolved})::int as completed_issues,
  coalesce(sum(${effectiveEstimate(ctx.orgId, 'i')}) filter (where not ${resolved}), 0)::int as remaining_estimate_minutes,
  coalesce(sum(${effectiveEstimate(ctx.orgId, 'i')}), 0)::int as total_estimate_minutes`;

const snapshotFrom = (ctx: TenantContext, sprintId: number) => sql`
  from sprints sp
  left join issues i on i.sprint_id = sp.id and i.org_id = sp.org_id and i.deleted_at is null
  left join workflow_statuses s on s.id = i.status_id
  where sp.org_id = ${ctx.orgId} and sp.id = ${sprintId}
  group by sp.id, sp.org_id`;

export function sprintsRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(sprints.org_id, ctx.orgId);

  return {
    async list(ctx: TenantContext, projectIds: readonly number[], states?: readonly string[]): Promise<SprintRow[]> {
      if (projectIds.length === 0) return [];
      return db
        .select()
        .from(sprints)
        .where(
          and(
            inOrg(ctx),
            inArray(sprints.project_id, [...projectIds]),
            states?.length ? inArray(sprints.state, [...states]) : undefined,
          ),
        )
        .orderBy(sql`${sprints.start_date} asc nulls last`, asc(sprints.id));
    },

    /** By slug first, then by name, case-insensitively: a name that is another sprint's slug still finds that slug. */
    async find(ctx: TenantContext, projectId: number, nameOrSlug: string): Promise<SprintRow | undefined> {
      const value = nameOrSlug.trim().toLowerCase();
      const rows = await db
        .select()
        .from(sprints)
        .where(
          and(
            inOrg(ctx),
            eq(sprints.project_id, projectId),
            or(eq(sprints.slug, value), sql`lower(${sprints.name}) = ${value}`),
          ),
        );
      return rows.find(r => r.slug === value) ?? rows[0];
    },

    async findActive(ctx: TenantContext, projectId: number): Promise<SprintRow | undefined> {
      const [row] = await db
        .select()
        .from(sprints)
        .where(and(inOrg(ctx), eq(sprints.project_id, projectId), eq(sprints.state, 'active')));
      return row;
    },

    async findByIds(ctx: TenantContext, ids: number[]): Promise<SprintRow[]> {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(sprints)
        .where(and(inOrg(ctx), inArray(sprints.id, [...new Set(ids)])));
    },

    async lock(ctx: TenantContext, id: number): Promise<SprintRow | undefined> {
      const [row] = await db
        .select()
        .from(sprints)
        .where(and(inOrg(ctx), eq(sprints.id, id)))
        .for('update');
      return row;
    },

    async slugsInProject(ctx: TenantContext, projectId: number): Promise<Set<string>> {
      const rows = await db
        .select({ slug: sprints.slug })
        .from(sprints)
        .where(and(inOrg(ctx), eq(sprints.project_id, projectId)));
      return new Set(rows.map(r => r.slug));
    },

    async insert(ctx: TenantContext, input: Omit<NewSprintRow, 'id' | 'org_id'>): Promise<SprintRow> {
      const [row] = await db
        .insert(sprints)
        .values({ ...input, org_id: ctx.orgId })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async update(ctx: TenantContext, id: number, patch: SprintPatch): Promise<SprintRow | undefined> {
      const [row] = await db
        .update(sprints)
        .set(patch)
        .where(and(inOrg(ctx), eq(sprints.id, id)))
        .returning();
      return row;
    },

    async remove(ctx: TenantContext, id: number): Promise<boolean> {
      const rows = await db
        .delete(sprints)
        .where(and(inOrg(ctx), eq(sprints.id, id)))
        .returning({ id: sprints.id });
      return rows.length > 0;
    },

    /** Progress over each sprint's live issues; `userId`'s share is the `mine` figures. */
    async figures(ctx: TenantContext, sprintIds: number[], userId: number): Promise<Map<number, SprintFigures>> {
      if (sprintIds.length === 0) return new Map();
      const ids = sql.join(
        [...new Set(sprintIds)].map(id => sql`${id}`),
        sql`, `,
      );
      const mine = sql`exists (select 1 from issue_assignees a where a.issue_id = i.id and a.org_id = ${ctx.orgId} and a.user_id = ${userId})`;
      const result = (await db.execute(sql`
        select i.sprint_id,
          count(*)::int as issues,
          count(*) filter (where ${resolved})::int as resolved_issues,
          coalesce(sum(i.story_points), 0)::int as points,
          coalesce(sum(i.story_points) filter (where ${resolved}), 0)::int as resolved_points,
          coalesce(sum(${effectiveEstimate(ctx.orgId, 'i')}) filter (where not ${resolved}), 0)::int as remaining_estimate_minutes,
          count(*) filter (where ${mine})::int as mine_issues,
          count(*) filter (where ${mine} and ${resolved})::int as mine_resolved_issues
        from issues i join workflow_statuses s on s.id = i.status_id
        where i.org_id = ${ctx.orgId} and i.deleted_at is null and i.sprint_id in (${ids})
        group by i.sprint_id`)) as Rows<Record<keyof SprintFigures, string | number>>;
      return new Map(
        result.rows.map(r => {
          const row = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])) as unknown as SprintFigures;
          return [row.sprint_id, row];
        }),
      );
    },

    /** Live issues per value of `field` in each sprint, unfiltered: the sprint line's strip and WIP totals. */
    async valueCounts(
      ctx: TenantContext,
      sprintIds: number[],
      field: 'status' | 'priority' | 'type' = 'status',
    ): Promise<{ sprint_id: number; value_id: number; n: number }[]> {
      if (sprintIds.length === 0) return [];
      const ids = sql.join(
        [...new Set(sprintIds)].map(id => sql`${id}`),
        sql`, `,
      );
      const column = sql.raw(`i.${field}_id`);
      const result = (await db.execute(sql`
        select i.sprint_id, ${column} as value_id, count(*)::int as n from issues i
        where i.org_id = ${ctx.orgId} and i.deleted_at is null and i.sprint_id in (${ids})
        group by 1, 2`)) as Rows<{ sprint_id: string | number; value_id: string | number; n: number }>;
      return result.rows.map(r => ({ sprint_id: Number(r.sprint_id), value_id: Number(r.value_id), n: Number(r.n) }));
    },

    async snapshots(ctx: TenantContext, sprintId: number): Promise<SprintSnapshotRow[]> {
      return db
        .select()
        .from(sprint_snapshots)
        .where(and(eq(sprint_snapshots.org_id, ctx.orgId), eq(sprint_snapshots.sprint_id, sprintId)))
        .orderBy(asc(sprint_snapshots.snapshot_date));
    },

    /** Today's figures for the sprint, replacing any written earlier the same day. */
    async writeSnapshot(ctx: TenantContext, sprintId: number, day: string): Promise<void> {
      await db.execute(sql`
        insert into sprint_snapshots (sprint_id, org_id, snapshot_date, total_points, completed_points,
          total_issues, completed_issues, remaining_estimate_minutes, total_estimate_minutes)
        select sp.id, sp.org_id, ${day}::date, ${snapshotFigures(ctx)}
        ${snapshotFrom(ctx, sprintId)}
        on conflict (sprint_id, snapshot_date) do update set
          total_points = excluded.total_points, completed_points = excluded.completed_points,
          total_issues = excluded.total_issues, completed_issues = excluded.completed_issues,
          remaining_estimate_minutes = excluded.remaining_estimate_minutes,
          total_estimate_minutes = excluded.total_estimate_minutes`);
    },

    /** The figures a snapshot would store now, without storing them: the burndown's live point for today. */
    async liveFigures(
      ctx: TenantContext,
      sprintId: number,
    ): Promise<Omit<SprintSnapshotRow, 'sprint_id' | 'org_id' | 'snapshot_date'> | undefined> {
      const result = (await db.execute(sql`
        select ${snapshotFigures(ctx)} ${snapshotFrom(ctx, sprintId)}`)) as {
        rows: Omit<SprintSnapshotRow, 'sprint_id' | 'org_id' | 'snapshot_date'>[];
      };
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        total_points: Number(row.total_points),
        completed_points: Number(row.completed_points),
        total_issues: Number(row.total_issues),
        completed_issues: Number(row.completed_issues),
        remaining_estimate_minutes: Number(row.remaining_estimate_minutes),
        total_estimate_minutes: Number(row.total_estimate_minutes),
      };
    },

    /** The nightly snapshot's one cross-tenant read: every active sprint, with its organisation. */
    async listActiveEverywhere(_ctx: SystemContext): Promise<{ id: number; org_id: number }[]> {
      return db.select({ id: sprints.id, org_id: sprints.org_id }).from(sprints).where(eq(sprints.state, 'active'));
    },
  };
}

export type SprintsRepository = ReturnType<typeof sprintsRepository>;
