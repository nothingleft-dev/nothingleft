import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { RESOLVED_STATUS_CATEGORIES } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import {
  issue_assignees,
  issue_stars,
  issue_votes,
  issue_watchers,
  issues,
  mentions,
  org_members,
  users,
  workflow_statuses,
  type IssueAssigneeRow,
  type IssueRow,
  type IssueWatcherRow,
  type NewIssueRow,
  type OrgMemberRow,
  type UserRow,
} from '../schema/index.ts';
import type { SystemContext, TenantContext } from '../tenant-context.ts';

// search_tsv is for the query compiler only; no row handed to a service carries it.
const allColumns = getTableColumns(issues);
export const issueColumns = Object.fromEntries(
  Object.entries(allColumns).filter(([name]) => name !== 'search_tsv'),
) as Omit<typeof allColumns, 'search_tsv'>;

export type IssuePatch = Partial<
  Pick<
    NewIssueRow,
    | 'title'
    | 'description_md'
    | 'status_id'
    | 'priority_id'
    | 'type_id'
    | 'estimate_minutes'
    | 'story_points'
    | 'sprint_id'
    | 'rank'
    | 'start_date'
    | 'due_date'
    | 'resolved_at'
    | 'parent_id'
    | 'updated_by'
    | 'updated_at'
    | 'deleted_at'
    | 'last_automation_at'
  >
>;

export interface IssueListOptions {
  projectId: number;
  deleted: boolean;
  limit: number;
  offset: number;
}

export interface IssuePerson {
  user: UserRow;
  membership: OrgMemberRow | null;
}

export interface PersonalSignals {
  starred: boolean;
  voted: boolean;
  watching: boolean;
}

type IssueInsert = Omit<NewIssueRow, 'org_id' | 'search_tsv'>;

export function issuesRepository(db: Queryable) {
  const inOrg = (ctx: TenantContext) => eq(issues.org_id, ctx.orgId);
  const live = isNull(issues.deleted_at);

  const people = (ctx: TenantContext) =>
    db
      .select({ user: users, membership: org_members })
      .from(users)
      .leftJoin(org_members, and(eq(org_members.user_id, users.id), eq(org_members.org_id, ctx.orgId)));

  return {
    async insert(ctx: TenantContext, input: IssueInsert): Promise<IssueRow> {
      const [row] = await db
        .insert(issues)
        .values({ ...input, org_id: ctx.orgId })
        .returning(issueColumns);
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    /** Soft-deleted issues answer only when asked for: restore is the one path that wants them. */
    async findByNumber(
      ctx: TenantContext,
      projectId: number,
      keyNumber: number,
      options: { includeDeleted?: boolean } = {},
    ): Promise<IssueRow | undefined> {
      const [row] = await db
        .select(issueColumns)
        .from(issues)
        .where(
          and(
            inOrg(ctx),
            eq(issues.project_id, projectId),
            eq(issues.key_number, keyNumber),
            options.includeDeleted ? undefined : live,
          ),
        )
        .limit(1);
      return row;
    },

    async findById(ctx: TenantContext, id: number): Promise<IssueRow | undefined> {
      const [row] = await db
        .select(issueColumns)
        .from(issues)
        .where(and(inOrg(ctx), eq(issues.id, id)))
        .limit(1);
      return row;
    },

    /** In the order asked, soft-deleted included; ids not in the organisation are skipped. */
    async findByIds(ctx: TenantContext, ids: number[]): Promise<IssueRow[]> {
      if (ids.length === 0) return [];
      const rows = await db
        .select(issueColumns)
        .from(issues)
        .where(and(inOrg(ctx), inArray(issues.id, [...new Set(ids)])));
      const byId = new Map(rows.map(r => [r.id, r]));
      return ids.flatMap(id => byId.get(id) ?? []);
    },

    /** Row-locked, so concurrent saves to one issue serialise and coalescing sees settled history. */
    async lockById(ctx: TenantContext, id: number): Promise<IssueRow | undefined> {
      const [row] = await db
        .select(issueColumns)
        .from(issues)
        .where(and(inOrg(ctx), eq(issues.id, id)))
        .for('update');
      return row;
    },

    async update(ctx: TenantContext, id: number, patch: IssuePatch): Promise<IssueRow | undefined> {
      const [row] = await db
        .update(issues)
        .set(patch)
        .where(and(inOrg(ctx), eq(issues.id, id)))
        .returning(issueColumns);
      return row;
    },

    async list(ctx: TenantContext, options: IssueListOptions): Promise<{ rows: IssueRow[]; total: number }> {
      const where = and(
        inOrg(ctx),
        eq(issues.project_id, options.projectId),
        options.deleted ? isNotNull(issues.deleted_at) : live,
      );
      const [rows, [totals]] = await Promise.all([
        db
          .select(issueColumns)
          .from(issues)
          .where(where)
          .orderBy(options.deleted ? desc(issues.deleted_at) : desc(issues.key_number))
          .limit(options.limit)
          .offset(options.offset),
        db.select({ n: count() }).from(issues).where(where),
      ]);
      return { rows, total: totals?.n ?? 0 };
    },

    async keyNumbers(ctx: TenantContext, ids: number[]): Promise<Map<number, number>> {
      if (ids.length === 0) return new Map();
      const rows = await db
        .select({ id: issues.id, key_number: issues.key_number })
        .from(issues)
        .where(and(inOrg(ctx), inArray(issues.id, ids)));
      return new Map(rows.map(r => [r.id, r.key_number]));
    },

    /** The chain above an issue, nearest first; soft-deleted ancestors still count toward depth. */
    async ancestorIds(ctx: TenantContext, id: number): Promise<number[]> {
      const result = await db.execute<{ id: string | number }>(sql`
        with recursive up(id, parent_id, depth) as (
          select i.id, i.parent_id, 0 from issues i where i.org_id = ${ctx.orgId} and i.id = ${id}
          union all
          select p.id, p.parent_id, up.depth + 1 from issues p join up on p.id = up.parent_id
          where p.org_id = ${ctx.orgId} and up.depth < 50
        )
        select id from up where depth > 0 order by depth`);
      return result.rows.map(r => Number(r.id));
    },

    /** Levels in the subtree rooted at an issue, itself included: a leaf is 1. */
    async subtreeHeight(ctx: TenantContext, id: number): Promise<number> {
      const result = await db.execute<{ height: string | number }>(sql`
        with recursive down(id, depth) as (
          select ${id}::bigint, 1
          union all
          select c.id, down.depth + 1 from issues c join down on c.parent_id = down.id
          where c.org_id = ${ctx.orgId} and down.depth < 50
        )
        select max(depth) as height from down`);
      return Number(result.rows[0]?.height ?? 1);
    },

    /** The issue and its live descendants; a deleted issue hides everything beneath it. */
    async liveSubtreeIds(ctx: TenantContext, id: number): Promise<number[]> {
      const result = await db.execute<{ id: string | number }>(sql`
        with recursive down(id, depth) as (
          select ${id}::bigint, 0
          union all
          select c.id, down.depth + 1 from issues c join down on c.parent_id = down.id
          where c.org_id = ${ctx.orgId} and c.deleted_at is null and down.depth < 50
        )
        select id from down order by depth, id`);
      return result.rows.map(r => Number(r.id));
    },

    /**
     * Recomputes spent_minutes on each issue and every ancestor from work_items over its live
     * subtree. Recomputing rather than adding a delta means a reparent, a delete or a restore
     * needs no arithmetic of its own, and a drifted value heals on the next write.
     */
    async refreshSpentRollup(ctx: TenantContext, ids: number[]): Promise<void> {
      if (ids.length === 0) return;
      const chain = sql`
        with recursive chain(id, depth) as (
          select i.id, 0 from issues i
          where i.org_id = ${ctx.orgId} and i.id in (${sql.join(
            [...new Set(ids)].map(id => sql`${id}`),
            sql`, `,
          )})
          union
          select i.parent_id, chain.depth + 1 from issues i join chain on i.id = chain.id
          where i.org_id = ${ctx.orgId} and i.parent_id is not null and chain.depth < 50
        )`;
      // Locked first, in id order, in its own statement: the recompute below then takes its
      // snapshot after any concurrent write under the same ancestors has committed.
      await db.execute(sql`${chain}
        select id from issues where org_id = ${ctx.orgId} and id in (select id from chain) order by id for update`);
      await db.execute(sql`${chain},
        roots as (select distinct id from chain),
        sub(root, id, depth) as (
          select id, id, 0 from roots
          union all
          select sub.root, c.id, sub.depth + 1 from issues c join sub on c.parent_id = sub.id
          where c.org_id = ${ctx.orgId} and c.deleted_at is null and sub.depth < 50
        ),
        totals as (
          select sub.root, coalesce(sum(w.duration_minutes), 0)::int as minutes
          from sub left join work_items w on w.issue_id = sub.id and w.org_id = ${ctx.orgId}
          group by sub.root
        )
        update issues set spent_minutes = totals.minutes
        from totals where issues.id = totals.root and issues.org_id = ${ctx.orgId}`);
    },

    /**
     * One backlog or sprint in drag order, row-locked so two drops into it serialise. Only the
     * columns a rank computation needs.
     */
    async lockContainer(
      ctx: TenantContext,
      projectId: number,
      sprintId: number | null,
    ): Promise<{ id: number; rank: number | null }[]> {
      return db
        .select({ id: issues.id, rank: issues.rank })
        .from(issues)
        .where(
          and(
            inOrg(ctx),
            eq(issues.project_id, projectId),
            sprintId === null ? isNull(issues.sprint_id) : eq(issues.sprint_id, sprintId),
            live,
          ),
        )
        .orderBy(sql`${issues.rank} asc nulls last`, asc(issues.created_at), asc(issues.id))
        .for('update');
    },

    /** Sprint and rank together, one statement for the whole batch. */
    async place(
      ctx: TenantContext,
      placements: { id: number; sprint_id: number | null; rank: number | null }[],
    ): Promise<void> {
      if (placements.length === 0) return;
      const values = sql.join(
        placements.map(p => sql`(${p.id}::bigint, ${p.sprint_id}::bigint, ${p.rank}::double precision)`),
        sql`, `,
      );
      await db.execute(sql`
        update issues set sprint_id = v.sprint_id, rank = v.rank
        from (values ${values}) as v(id, sprint_id, rank)
        where issues.id = v.id and issues.org_id = ${ctx.orgId}`);
    },

    /** A sprint's live issues in drag order; `unresolved` keeps only those not done or cancelled. */
    async listInSprint(
      ctx: TenantContext,
      sprintId: number,
      options: { unresolved?: boolean } = {},
    ): Promise<IssueRow[]> {
      return db
        .select(issueColumns)
        .from(issues)
        .where(
          and(
            inOrg(ctx),
            eq(issues.sprint_id, sprintId),
            live,
            options.unresolved ? isNull(issues.resolved_at) : undefined,
          ),
        )
        .orderBy(sql`${issues.rank} asc nulls last`, asc(issues.created_at), asc(issues.id));
    },

    /** Soft-deleted issues keep their sprint; a planned sprint's delete lets them go first. */
    async clearSprint(ctx: TenantContext, sprintId: number): Promise<void> {
      await db
        .update(issues)
        .set({ sprint_id: null, rank: null })
        .where(and(inOrg(ctx), eq(issues.sprint_id, sprintId)));
    },

    /** Live direct subtasks, resolved and in total: the `1/3` on a card. */
    async subtaskProgress(
      ctx: TenantContext,
      ids: number[],
    ): Promise<Map<number, { resolved: number; total: number }>> {
      if (ids.length === 0) return new Map();
      const rows = await db
        .select({
          parent_id: issues.parent_id,
          total: count(),
          resolved: sql<number>`count(*) filter (where ${issues.resolved_at} is not null)::int`,
        })
        .from(issues)
        .where(and(inOrg(ctx), inArray(issues.parent_id, [...new Set(ids)]), live))
        .groupBy(issues.parent_id);
      return new Map(rows.map(r => [Number(r.parent_id), { resolved: Number(r.resolved), total: Number(r.total) }]));
    },

    /** Story points summed over each issue's live descendants; absent when none has points. */
    async storyPointsRollup(ctx: TenantContext, ids: number[]): Promise<Map<number, number>> {
      if (ids.length === 0) return new Map();
      const roots = sql.join(
        [...new Set(ids)].map(id => sql`${id}`),
        sql`, `,
      );
      const result = (await db.execute(sql`
        with recursive sub(root, id, depth) as (
          select c.parent_id, c.id, 1 from issues c
          where c.org_id = ${ctx.orgId} and c.deleted_at is null and c.parent_id in (${roots})
          union all
          select sub.root, c.id, sub.depth + 1 from issues c join sub on c.parent_id = sub.id
          where c.org_id = ${ctx.orgId} and c.deleted_at is null and sub.depth < 50
        )
        select sub.root, sum(i.story_points)::int as points
        from sub join issues i on i.id = sub.id and i.org_id = ${ctx.orgId}
        where i.story_points is not null group by sub.root`)) as { rows: { root: string | number; points: number }[] };
      return new Map(result.rows.map(r => [Number(r.root), Number(r.points)]));
    },

    /** Each issue's nearest ancestor whose type is one of `typeIds`: its lane on a board swimlaned by issues. */
    async nearestAncestorOfTypes(ctx: TenantContext, ids: number[], typeIds: number[]): Promise<Map<number, number>> {
      if (ids.length === 0 || typeIds.length === 0) return new Map();
      const start = sql.join(
        [...new Set(ids)].map(id => sql`${id}`),
        sql`, `,
      );
      const types = sql.join(
        typeIds.map(id => sql`${id}`),
        sql`, `,
      );
      const result = (await db.execute(sql`
        with recursive up(card, id, depth) as (
          select i.id, i.parent_id, 1 from issues i
          where i.org_id = ${ctx.orgId} and i.id in (${start}) and i.parent_id is not null
          union all
          select up.card, p.parent_id, up.depth + 1 from issues p join up on p.id = up.id
          where p.org_id = ${ctx.orgId} and p.parent_id is not null and up.depth < 50
        )
        select distinct on (up.card) up.card, up.id as lane from up
        join issues a on a.id = up.id and a.org_id = ${ctx.orgId} and a.deleted_at is null
        where a.type_id in (${types})
        order by up.card, up.depth`)) as { rows: { card: string | number; lane: string | number }[] };
      return new Map(result.rows.map(r => [Number(r.card), Number(r.lane)]));
    },

    async listChildren(ctx: TenantContext, parentId: number): Promise<IssueRow[]> {
      return db
        .select(issueColumns)
        .from(issues)
        .where(and(inOrg(ctx), eq(issues.parent_id, parentId), live))
        .orderBy(asc(issues.key_number));
    },

    async adjustCommentCount(ctx: TenantContext, id: number, delta: 1 | -1): Promise<void> {
      await db
        .update(issues)
        .set({ comment_count: sql`greatest(${issues.comment_count} + ${delta}, 0)` })
        .where(and(inOrg(ctx), eq(issues.id, id)));
    },

    async findByKeys(ctx: TenantContext, keys: { projectId: number; number: number }[]): Promise<IssueRow[]> {
      if (keys.length === 0) return [];
      return db
        .select(issueColumns)
        .from(issues)
        .where(
          and(
            inOrg(ctx),
            live,
            or(...keys.map(k => and(eq(issues.project_id, k.projectId), eq(issues.key_number, k.number)))),
          ),
        );
    },

    /**
     * The editor's issue picker: a key prefix (`PMS-1` finds PMS-1, PMS-12…) or a title substring,
     * within the given projects; the preferred project first, then most recently updated.
     */
    async pick(
      ctx: TenantContext,
      options: {
        projectIds: number[];
        text: string;
        key?: { projectId: number; numberPrefix: string } | undefined;
        preferProjectId?: number | undefined;
        limit: number;
      },
    ): Promise<IssueRow[]> {
      if (options.projectIds.length === 0) return [];
      const title = ilike(issues.title, `%${options.text.replace(/[\\%_]/g, c => `\\${c}`)}%`);
      const byKey = options.key
        ? and(
            eq(issues.project_id, options.key.projectId),
            sql`${issues.key_number}::text like ${`${options.key.numberPrefix}%`}`,
          )
        : undefined;
      const preferred = options.preferProjectId ?? 0;
      return db
        .select(issueColumns)
        .from(issues)
        .where(and(inOrg(ctx), live, inArray(issues.project_id, options.projectIds), byKey ? or(byKey, title) : title))
        .orderBy(
          sql`case when ${issues.project_id} = ${preferred} then 0 else 1 end`,
          ...(byKey ? [sql`case when ${byKey} then 0 else 1 end`] : []),
          desc(issues.updated_at),
          desc(issues.id),
        )
        .limit(options.limit);
    },

    async listAssignees(ctx: TenantContext, issueIds: number[]): Promise<(IssueAssigneeRow & IssuePerson)[]> {
      if (issueIds.length === 0) return [];
      const rows = await db
        .select({ assignee: issue_assignees, user: users, membership: org_members })
        .from(issue_assignees)
        .innerJoin(users, eq(users.id, issue_assignees.user_id))
        .leftJoin(
          org_members,
          and(eq(org_members.user_id, issue_assignees.user_id), eq(org_members.org_id, issue_assignees.org_id)),
        )
        .where(and(eq(issue_assignees.org_id, ctx.orgId), inArray(issue_assignees.issue_id, issueIds)))
        .orderBy(issue_assignees.assigned_at, issue_assignees.user_id);
      return rows.map(r => ({ ...r.assignee, user: r.user, membership: r.membership }));
    },

    async addAssignees(ctx: TenantContext, issueId: number, userIds: number[]): Promise<void> {
      if (userIds.length === 0) return;
      await db
        .insert(issue_assignees)
        .values(userIds.map(user_id => ({ issue_id: issueId, org_id: ctx.orgId, user_id })))
        .onConflictDoNothing();
    },

    async removeAssignees(ctx: TenantContext, issueId: number, userIds: number[]): Promise<void> {
      if (userIds.length === 0) return;
      await db
        .delete(issue_assignees)
        .where(
          and(
            eq(issue_assignees.org_id, ctx.orgId),
            eq(issue_assignees.issue_id, issueId),
            inArray(issue_assignees.user_id, userIds),
          ),
        );
    },

    /** Live issues only: a trashed issue keeps its assignee through a removal. */
    async countAssignedTo(ctx: TenantContext, userId: number): Promise<{ open: number; resolved: number }> {
      const resolved = sql`${workflow_statuses.category} in (${sql.join(
        RESOLVED_STATUS_CATEGORIES.map(c => sql`${c}`),
        sql`, `,
      )})`;
      const [row] = await db
        .select({
          open: sql<number>`count(*) filter (where not ${resolved})::int`,
          resolved: sql<number>`count(*) filter (where ${resolved})::int`,
        })
        .from(issue_assignees)
        .innerJoin(issues, and(eq(issues.id, issue_assignees.issue_id), eq(issues.org_id, issue_assignees.org_id)))
        .innerJoin(
          workflow_statuses,
          and(eq(workflow_statuses.id, issues.status_id), eq(workflow_statuses.org_id, issues.org_id)),
        )
        .where(and(eq(issue_assignees.org_id, ctx.orgId), eq(issue_assignees.user_id, userId), live));
      return { open: row?.open ?? 0, resolved: row?.resolved ?? 0 };
    },

    async listOpenAssignedTo(ctx: TenantContext, userId: number): Promise<{ id: number; project_id: number }[]> {
      return db
        .select({ id: issues.id, project_id: issues.project_id })
        .from(issue_assignees)
        .innerJoin(issues, and(eq(issues.id, issue_assignees.issue_id), eq(issues.org_id, issue_assignees.org_id)))
        .innerJoin(
          workflow_statuses,
          and(eq(workflow_statuses.id, issues.status_id), eq(workflow_statuses.org_id, issues.org_id)),
        )
        .where(
          and(
            eq(issue_assignees.org_id, ctx.orgId),
            eq(issue_assignees.user_id, userId),
            live,
            sql`${workflow_statuses.category} not in (${sql.join(
              RESOLVED_STATUS_CATEGORIES.map(c => sql`${c}`),
              sql`, `,
            )})`,
          ),
        )
        .orderBy(asc(issues.id));
    },

    async countCreatedBy(ctx: TenantContext, userId: number): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(issues)
        .where(and(inOrg(ctx), eq(issues.created_by, userId), live));
      return row?.n ?? 0;
    },

    /** Everyone a DTO names, removed members included: attribution must survive removal. */
    async findPeople(ctx: TenantContext, userIds: number[]): Promise<IssuePerson[]> {
      if (userIds.length === 0) return [];
      return people(ctx).where(inArray(users.id, [...new Set(userIds)]));
    },

    async signalsFor(ctx: TenantContext, issueIds: number[], userId: number): Promise<Map<number, PersonalSignals>> {
      const out = new Map<number, PersonalSignals>();
      if (issueIds.length === 0) return out;
      for (const id of issueIds) out.set(id, { starred: false, voted: false, watching: false });
      const mine = <T extends typeof issue_stars | typeof issue_votes | typeof issue_watchers>(t: T) =>
        db
          .select({ issue_id: t.issue_id })
          .from(t as typeof issue_stars)
          .where(and(eq(t.org_id, ctx.orgId), eq(t.user_id, userId), inArray(t.issue_id, issueIds)));
      const [stars, votes, watches] = await Promise.all([mine(issue_stars), mine(issue_votes), mine(issue_watchers)]);
      for (const r of stars) out.get(r.issue_id)!.starred = true;
      for (const r of votes) out.get(r.issue_id)!.voted = true;
      for (const r of watches) out.get(r.issue_id)!.watching = true;
      return out;
    },

    async watcherCounts(ctx: TenantContext, issueIds: number[]): Promise<Map<number, number>> {
      if (issueIds.length === 0) return new Map();
      const rows = await db
        .select({ issue_id: issue_watchers.issue_id, n: count() })
        .from(issue_watchers)
        .where(and(eq(issue_watchers.org_id, ctx.orgId), inArray(issue_watchers.issue_id, issueIds)))
        .groupBy(issue_watchers.issue_id);
      return new Map(rows.map(r => [r.issue_id, r.n]));
    },

    async star(ctx: TenantContext, issueId: number, userId: number): Promise<void> {
      await db
        .insert(issue_stars)
        .values({ issue_id: issueId, org_id: ctx.orgId, user_id: userId })
        .onConflictDoNothing();
    },

    async unstar(ctx: TenantContext, issueId: number, userId: number): Promise<void> {
      await db
        .delete(issue_stars)
        .where(
          and(eq(issue_stars.org_id, ctx.orgId), eq(issue_stars.issue_id, issueId), eq(issue_stars.user_id, userId)),
        );
    },

    /** The denormalised vote_count moves only when a row actually appears or disappears. */
    async vote(ctx: TenantContext, issueId: number, userId: number): Promise<void> {
      const added = await db
        .insert(issue_votes)
        .values({ issue_id: issueId, org_id: ctx.orgId, user_id: userId })
        .onConflictDoNothing()
        .returning({ issue_id: issue_votes.issue_id });
      if (added.length > 0) {
        await db
          .update(issues)
          .set({ vote_count: sql`${issues.vote_count} + 1` })
          .where(and(inOrg(ctx), eq(issues.id, issueId)));
      }
    },

    async unvote(ctx: TenantContext, issueId: number, userId: number): Promise<void> {
      const removed = await db
        .delete(issue_votes)
        .where(
          and(eq(issue_votes.org_id, ctx.orgId), eq(issue_votes.issue_id, issueId), eq(issue_votes.user_id, userId)),
        )
        .returning({ issue_id: issue_votes.issue_id });
      if (removed.length > 0) {
        await db
          .update(issues)
          .set({ vote_count: sql`greatest(${issues.vote_count} - 1, 0)` })
          .where(and(inOrg(ctx), eq(issues.id, issueId)));
      }
    },

    async listVoters(ctx: TenantContext, issueId: number): Promise<IssuePerson[]> {
      return db
        .select({ user: users, membership: org_members })
        .from(issue_votes)
        .innerJoin(users, eq(users.id, issue_votes.user_id))
        .leftJoin(
          org_members,
          and(eq(org_members.user_id, issue_votes.user_id), eq(org_members.org_id, issue_votes.org_id)),
        )
        .where(and(eq(issue_votes.org_id, ctx.orgId), eq(issue_votes.issue_id, issueId)))
        .orderBy(issue_votes.created_at);
    },

    /** An existing row keeps its source: an explicit watch is never downgraded to auto. */
    async watch(ctx: TenantContext, issueId: number, userIds: number[], source: 'explicit' | 'auto'): Promise<void> {
      if (userIds.length === 0) return;
      const insert = db
        .insert(issue_watchers)
        .values(userIds.map(user_id => ({ issue_id: issueId, org_id: ctx.orgId, user_id, source })));
      if (source === 'explicit') {
        await insert.onConflictDoUpdate({
          target: [issue_watchers.issue_id, issue_watchers.user_id],
          set: { source: 'explicit' },
        });
      } else {
        await insert.onConflictDoNothing();
      }
    },

    async unwatch(ctx: TenantContext, issueId: number, userId: number): Promise<IssueWatcherRow | undefined> {
      const [row] = await db
        .delete(issue_watchers)
        .where(
          and(
            eq(issue_watchers.org_id, ctx.orgId),
            eq(issue_watchers.issue_id, issueId),
            eq(issue_watchers.user_id, userId),
          ),
        )
        .returning();
      return row;
    },

    async listWatchers(ctx: TenantContext, issueId: number): Promise<(IssueWatcherRow & IssuePerson)[]> {
      const rows = await db
        .select({ watcher: issue_watchers, user: users, membership: org_members })
        .from(issue_watchers)
        .innerJoin(users, eq(users.id, issue_watchers.user_id))
        .leftJoin(
          org_members,
          and(eq(org_members.user_id, issue_watchers.user_id), eq(org_members.org_id, issue_watchers.org_id)),
        )
        .where(and(eq(issue_watchers.org_id, ctx.orgId), eq(issue_watchers.issue_id, issueId)))
        .orderBy(issue_watchers.created_at, issue_watchers.user_id);
      return rows.map(r => ({ ...r.watcher, user: r.user, membership: r.membership }));
    },

    /** Replaces every mention one source holds, so an edit that drops a name drops its row. */
    async replaceMentions(
      ctx: TenantContext,
      source: { type: 'issue' | 'comment' | 'work_item'; id: number; issueId: number },
      userIds: number[],
    ): Promise<void> {
      await db
        .delete(mentions)
        .where(
          and(eq(mentions.org_id, ctx.orgId), eq(mentions.source_type, source.type), eq(mentions.source_id, source.id)),
        );
      if (userIds.length === 0) return;
      await db.insert(mentions).values(
        [...new Set(userIds)].map(mentioned_user_id => ({
          org_id: ctx.orgId,
          source_type: source.type,
          source_id: source.id,
          mentioned_user_id,
          issue_id: source.issueId,
        })),
      );
    },

    async listMentionedUserIds(
      ctx: TenantContext,
      source: { type: 'issue' | 'comment' | 'work_item'; id: number },
    ): Promise<number[]> {
      const rows = await db
        .select({ id: mentions.mentioned_user_id })
        .from(mentions)
        .where(
          and(eq(mentions.org_id, ctx.orgId), eq(mentions.source_type, source.type), eq(mentions.source_id, source.id)),
        );
      return rows.map(r => r.id);
    },

    /** The nightly purge's one cross-tenant read: which organisations have anything to purge. */
    async orgsWithDeletedBefore(_ctx: SystemContext, cutoff: Date): Promise<number[]> {
      const rows = await db.selectDistinct({ org_id: issues.org_id }).from(issues).where(lt(issues.deleted_at, cutoff));
      return rows.map(r => r.org_id);
    },

    /** One batch of the purge, oldest id first. */
    async idsDeletedBefore(ctx: TenantContext, cutoff: Date, limit: number): Promise<number[]> {
      const rows = await db
        .select({ id: issues.id })
        .from(issues)
        .where(and(inOrg(ctx), lt(issues.deleted_at, cutoff)))
        .orderBy(asc(issues.id))
        .limit(limit);
      return rows.map(r => r.id);
    },

    /**
     * Hard delete of the claimed ids still deleted before the cutoff; comments, work items, attachments,
     * activity and mentions go by cascade. Returns the ids it removed.
     */
    async purgeDeletedBefore(ctx: TenantContext, cutoff: Date, ids: number[]): Promise<number[]> {
      if (ids.length === 0) return [];
      const doomed = and(inOrg(ctx), inArray(issues.id, ids), lt(issues.deleted_at, cutoff));
      // A live child keeps living; it loses a parent rather than blocking the purge.
      await db
        .update(issues)
        .set({ parent_id: null })
        .where(and(inOrg(ctx), inArray(issues.parent_id, db.select({ id: issues.id }).from(issues).where(doomed))));
      const rows = await db.delete(issues).where(doomed).returning({ id: issues.id });
      return rows.map(r => r.id);
    },
  };
}

export type IssuesRepository = ReturnType<typeof issuesRepository>;
