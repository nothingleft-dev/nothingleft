import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { resolveDatePeriod, type Query, type SortKey } from '@nothingleft/query';
import {
  RESOLVED_STATUS_CATEGORIES,
  STATUS_CATEGORIES,
  type IssueGroupBy,
  type StatusCategory,
} from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import {
  custom_field_options,
  custom_fields,
  issue_types,
  issues,
  org_members,
  priorities,
  projects,
  sprints,
  tags,
  work_types,
  workflow_statuses,
  type IssueRow,
} from '../schema/index.ts';
import { issueSearch, type IssueSearchScope } from '../search/issue-query.ts';
import { byDisplayOrder, issueGroupSource, statusCategoryOf } from '../search/issue-groups.ts';
import type { TenantContext } from '../tenant-context.ts';
import { issueColumns } from './issues.repository.ts';

export type SearchScope = Omit<IssueSearchScope, 'orgId' | 'userId'>;

export interface IssueGroupRow {
  /** Stable, lowercased; `''` is the empty group (Unassigned, No due date…). */
  key: string;
  value: string | null;
  label: string | null;
  color: string | null;
  /** Set only when grouping by status. */
  category: StatusCategory | null;
  count: number;
}

/** One backlog or sprint of one project, or all its open issues, listed in drag order instead of the query's. */
export interface IssueContainer {
  projectId: number;
  /** null: the backlog. `'unresolved'`: every unresolved issue in the project, whatever its sprint. */
  sprintId: number | null | 'unresolved';
}

export interface IssueSearchOptions {
  sort: readonly SortKey[];
  groupBy?: IssueGroupBy | undefined;
  /** With `groupBy`: at most this many rows from each group, so a large group cannot crowd out the rest. */
  groupLimit?: number | undefined;
  container?: IssueContainer | undefined;
  limit: number;
  offset: number;
}

export interface IssueSearchResult {
  entries: { row: IssueRow; group: string | null }[];
  total: number;
  /** Rows a page can reach: `total`, or less under a group limit. */
  reachable: number;
  groups: IssueGroupRow[] | null;
}

export interface IssueFigureRow {
  project_id: number | null;
  open: number;
  unassigned: number;
  overdue: number;
  due_today: number;
  created_7d: number;
  resolved_7d: number;
  resolved_prev_7d: number;
  last_updated_at: Date | null;
  by_category: Record<string, number>;
  by_assignee: { user_id: number; open: number }[];
  logged_minutes_this_week: number;
}

export interface SearchVocabulary {
  projects: { key: string; name: string }[];
  statuses: string[];
  priorities: string[];
  types: string[];
  work_types: string[];
  tags: { name: string; slug: string }[];
  sprints: { name: string; slug: string }[];
  usernames: { username: string; removed: boolean }[];
  /** Option names per custom select slug the query names. */
  options: Record<string, string[]>;
}

const DAY_MS = 86_400_000;
const BY_ASSIGNEE_MAX = 20;

type Rows<T> = { rows: T[] };

const unresolvedStatus = sql`${issues.status_id} in (select s.id from ${workflow_statuses} s where s.org_id = ${issues.org_id} and s.category not in (${sql.join(
  RESOLVED_STATUS_CATEGORIES.map(c => sql`${c}`),
  sql`, `,
)}))`;

const inContainer = (c: IssueContainer): SQL =>
  and(
    eq(issues.project_id, c.projectId),
    c.sprintId === 'unresolved'
      ? unresolvedStatus
      : c.sprintId === null
        ? isNull(issues.sprint_id)
        : eq(issues.sprint_id, c.sprintId),
  )!;

// Nulls last: an issue nobody has dragged falls back to its age.
export const RANK_ORDER = sql`${issues.rank} asc nulls last, ${issues.created_at} asc, ${issues.id} asc`;

export function issueSearchRepository(db: Queryable) {
  const compiler = (ctx: TenantContext, scope: SearchScope) => {
    if (ctx.userId === null) throw new Error('issue search needs the caller in its TenantContext');
    return issueSearch({ ...scope, orgId: ctx.orgId, userId: ctx.userId });
  };

  const groupSource = (ctx: TenantContext, scope: SearchScope, field: IssueGroupBy): SQL =>
    issueGroupSource(compiler(ctx, scope), { ...scope, orgId: ctx.orgId }, field);

  async function loadRows(ctx: TenantContext, ids: number[]): Promise<Map<number, IssueRow>> {
    if (ids.length === 0) return new Map();
    const rows = await db
      .select(issueColumns)
      .from(issues)
      .where(and(eq(issues.org_id, ctx.orgId), inArray(issues.id, [...new Set(ids)])));
    return new Map(rows.map(r => [r.id, r]));
  }

  return {
    /** The list: one page of the query in order, plus per-group counts over the whole filtered set. */
    async search(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      options: IssueSearchOptions,
    ): Promise<IssueSearchResult> {
      const compiled = compiler(ctx, scope);
      const where = options.container
        ? and(compiled.where(query), inContainer(options.container))!
        : compiled.where(query);
      const order = options.container ? RANK_ORDER : sql.join(compiled.orderBy(query, options.sort), sql`, `);

      if (!options.groupBy) {
        const [page, totals] = await Promise.all([
          db.execute(
            sql`select ${issues.id} as id from ${issues} where ${where} order by ${order} limit ${options.limit} offset ${options.offset}`,
          ) as Promise<Rows<{ id: string | number }>>,
          db.execute(sql`select count(*)::int as n from ${issues} where ${where}`) as Promise<Rows<{ n: number }>>,
        ]);
        const ids = page.rows.map(r => Number(r.id));
        const rows = await loadRows(ctx, ids);
        return {
          entries: ids.map(id => ({ row: rows.get(id)!, group: null })),
          total: Number(totals.rows[0]?.n ?? 0),
          reachable: Number(totals.rows[0]?.n ?? 0),
          groups: null,
        };
      }

      const source = groupSource(ctx, scope, options.groupBy);
      const counted = (await db.execute(
        sql`select coalesce(g.k, '') as key, min(g.v) as value, min(g.l) as label, min(g.c) as color, min(g.o) as o, count(*)::int as n
            from ${issues} left join lateral ${source} g on true where ${where} group by 1`,
      )) as Rows<{
        key: string;
        value: string | null;
        label: string | null;
        color: string | null;
        o: number | null;
        n: number;
      }>;
      const sorted = byDisplayOrder(counted.rows);
      const groups: IssueGroupRow[] = sorted.map(g => ({
        key: g.key,
        value: g.key === '' ? null : g.value,
        label: g.key === '' ? null : g.label,
        color: g.color,
        category: options.groupBy === 'status' ? statusCategoryOf(g.o) : null,
        count: Number(g.n),
      }));
      const keys = sql.join(
        groups.map(g => sql`${g.key}`),
        sql`, `,
      );
      const groupOrder = sql`array_position(array[${keys}]::text[], coalesce(g.k, ''))`;
      const page = (await db.execute(
        options.groupLimit
          ? sql`select id, grp from (
                  select ${issues.id} as id, g.v as grp,
                    row_number() over (partition by coalesce(g.k, '') order by ${order}) as in_group,
                    row_number() over (order by ${groupOrder}, ${order}) as position
                  from ${issues} left join lateral ${source} g on true where ${where}
                ) ranked where in_group <= ${options.groupLimit}
                order by position limit ${options.limit} offset ${options.offset}`
          : sql`select ${issues.id} as id, g.v as grp from ${issues} left join lateral ${source} g on true where ${where}
                order by ${groupOrder}, ${order} limit ${options.limit} offset ${options.offset}`,
      )) as Rows<{ id: string | number; grp: string | null }>;
      const rows = await loadRows(
        ctx,
        page.rows.map(r => Number(r.id)),
      );
      return {
        entries: page.rows.map(r => ({ row: rows.get(Number(r.id))!, group: r.grp })),
        total: groups.reduce((sum, g) => sum + g.count, 0),
        reachable: groups.reduce((sum, g) => sum + Math.min(g.count, options.groupLimit ?? g.count), 0),
        groups,
      };
    },

    /** One page of the query in `search`'s order, without the count a paged list needs. */
    async page(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      options: { sort: readonly SortKey[]; limit: number; offset: number },
    ): Promise<IssueRow[]> {
      const compiled = compiler(ctx, scope);
      return db
        .select(issueColumns)
        .from(issues)
        .where(compiled.where(query))
        .orderBy(...compiled.orderBy(query, options.sort))
        .limit(options.limit)
        .offset(options.offset);
    },

    /** Filter-aware counts per value of `field` within one container: board columns and the distribution strip. */
    async valueCounts(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      container: IssueContainer,
      field: 'status' | 'priority' | 'type' = 'status',
    ): Promise<{ value_id: number; n: number }[]> {
      const where = and(compiler(ctx, scope).where(query), inContainer(container))!;
      const column = { status: issues.status_id, priority: issues.priority_id, type: issues.type_id }[field];
      const result = (await db.execute(
        sql`select ${column} as value_id, count(*)::int as n from ${issues} where ${where} group by 1`,
      )) as Rows<{ value_id: string | number; n: number }>;
      return result.rows.map(r => ({ value_id: Number(r.value_id), n: Number(r.n) }));
    },

    /** Dashboard and project figures over the same scoped query; one row, or one per project. */
    async figures(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      options: { perProject: boolean },
    ): Promise<IssueFigureRow[]> {
      const compiled = compiler(ctx, scope);
      const where = compiled.where(query);
      const now = scope.now.getTime();
      const weekAgo = new Date(now - 7 * DAY_MS).toISOString();
      const twoWeeksAgo = new Date(now - 14 * DAY_MS).toISOString();
      const week = resolveDatePeriod({ kind: 'keyword', keyword: 'this week' }, scope)!;
      const projectColumn = options.perProject ? sql`${issues.project_id}` : sql`null::bigint`;
      const groupBy = options.perProject ? sql`group by 1` : sql``;
      const unresolved = sql`s.category not in ('done', 'cancelled')`;
      const from = sql`from ${issues} join workflow_statuses s on s.id = ${issues.status_id} where ${where}`;

      const [totals, categories, byAssignee, logged] = await Promise.all([
        db.execute(sql`select ${projectColumn} as project_id,
            count(*) filter (where ${unresolved})::int as open,
            count(*) filter (where ${unresolved} and not exists (select 1 from issue_assignees a where a.issue_id = ${issues.id} and a.org_id = ${ctx.orgId}))::int as unassigned,
            count(*) filter (where ${unresolved} and ${issues.due_date} < ${scope.today})::int as overdue,
            count(*) filter (where ${unresolved} and ${issues.due_date} = ${scope.today})::int as due_today,
            count(*) filter (where ${issues.created_at} >= ${weekAgo})::int as created_7d,
            count(*) filter (where ${issues.resolved_at} >= ${weekAgo})::int as resolved_7d,
            count(*) filter (where ${issues.resolved_at} >= ${twoWeeksAgo} and ${issues.resolved_at} < ${weekAgo})::int as resolved_prev_7d,
            max(${issues.updated_at}) as last_updated_at
            ${from} ${groupBy}`) as Promise<
          Rows<
            Omit<IssueFigureRow, 'by_category' | 'by_assignee' | 'logged_minutes_this_week' | 'last_updated_at'> & {
              last_updated_at: string | Date | null;
            }
          >
        >,
        db.execute(
          sql`select ${projectColumn} as project_id, s.category, count(*)::int as n ${from} group by 1, 2`,
        ) as Promise<Rows<{ project_id: number | null; category: string; n: number }>>,
        db.execute(
          sql`select ${projectColumn} as project_id, a.user_id, count(*)::int as n
              from ${issues} join workflow_statuses s on s.id = ${issues.status_id}
              join issue_assignees a on a.issue_id = ${issues.id} and a.org_id = ${ctx.orgId}
              where ${where} and ${unresolved} group by 1, 2`,
        ) as Promise<Rows<{ project_id: number | string | null; user_id: number | string; n: number }>>,
        db.execute(sql`select ${projectColumn} as project_id, coalesce(sum(w.duration_minutes), 0)::int as n
            from ${issues} join work_items w on w.issue_id = ${issues.id} and w.org_id = ${ctx.orgId}
            where ${where} and w.author_id = ${ctx.userId} and w.work_date between ${week.start} and ${week.end} ${groupBy}`) as Promise<
          Rows<{ project_id: number | null; n: number }>
        >,
      ]);

      const keyOf = (id: number | string | null) => (id === null ? null : Number(id));
      return totals.rows.map(t => {
        const projectId = keyOf(t.project_id);
        const by_category = Object.fromEntries(STATUS_CATEGORIES.map(c => [c, 0])) as Record<string, number>;
        for (const c of categories.rows) if (keyOf(c.project_id) === projectId) by_category[c.category] = Number(c.n);
        return {
          project_id: projectId,
          open: Number(t.open),
          unassigned: Number(t.unassigned),
          overdue: Number(t.overdue),
          due_today: Number(t.due_today),
          created_7d: Number(t.created_7d),
          resolved_7d: Number(t.resolved_7d),
          resolved_prev_7d: Number(t.resolved_prev_7d),
          last_updated_at: t.last_updated_at === null ? null : new Date(t.last_updated_at),
          by_category,
          by_assignee: byAssignee.rows
            .filter(a => keyOf(a.project_id) === projectId)
            .map(a => ({ user_id: Number(a.user_id), open: Number(a.n) }))
            .sort((a, b) => b.open - a.open || a.user_id - b.user_id)
            .slice(0, BY_ASSIGNEE_MAX),
          logged_minutes_this_week: Number(logged.rows.find(l => keyOf(l.project_id) === projectId)?.n ?? 0),
        };
      });
    },

    /** The names a query may use within the caller's projects, for `valid_values` on a miss. */
    async vocabulary(
      ctx: TenantContext,
      projectIds: readonly number[],
      needs: ReadonlySet<string>,
      optionSlugs: readonly string[] = [],
    ): Promise<SearchVocabulary> {
      const ids = [...projectIds];
      const inProjects = (t: typeof workflow_statuses) =>
        ids.length === 0
          ? Promise.resolve([] as { name: string }[])
          : db
              .selectDistinct({ name: t.name })
              .from(t)
              .where(and(eq(t.org_id, ctx.orgId), inArray(t.project_id, ids)))
              .orderBy(t.name);
      const names = async (need: string, t: typeof workflow_statuses) =>
        needs.has(need) ? (await inProjects(t)).map(r => r.name) : [];

      const wantedOptions = optionSlugs.filter(slug => needs.has(slug));
      const [
        projectRows,
        statuses,
        priorityNames,
        typeNames,
        workTypeNames,
        tagRows,
        sprintRows,
        usernames,
        optionRows,
      ] = await Promise.all([
        needs.has('project') && ids.length > 0
          ? db
              .select({ key: projects.key, name: projects.name })
              .from(projects)
              .where(and(eq(projects.org_id, ctx.orgId), inArray(projects.id, ids)))
              .orderBy(projects.key)
          : [],
        names('status', workflow_statuses),
        names('priority', priorities as unknown as typeof workflow_statuses),
        names('type', issue_types as unknown as typeof workflow_statuses),
        names('work type', work_types as unknown as typeof workflow_statuses),
        needs.has('tag')
          ? db
              .select({ name: tags.name, slug: tags.slug })
              .from(tags)
              .where(eq(tags.org_id, ctx.orgId))
              .orderBy(tags.slug)
          : [],
        needs.has('sprint') && ids.length > 0
          ? db
              .selectDistinct({ name: sprints.name, slug: sprints.slug })
              .from(sprints)
              .where(and(eq(sprints.org_id, ctx.orgId), inArray(sprints.project_id, ids)))
              .orderBy(sprints.name)
          : [],
        needs.has('user')
          ? db
              .select({ username: org_members.username, removed_at: org_members.removed_at })
              .from(org_members)
              .where(eq(org_members.org_id, ctx.orgId))
              .orderBy(sql`lower(${org_members.username})`)
          : [],
        wantedOptions.length > 0 && ids.length > 0
          ? db
              .selectDistinct({ slug: custom_fields.slug, name: custom_field_options.name })
              .from(custom_field_options)
              .innerJoin(
                custom_fields,
                and(
                  eq(custom_fields.id, custom_field_options.field_id),
                  eq(custom_fields.org_id, custom_field_options.org_id),
                ),
              )
              .where(
                and(
                  eq(custom_field_options.org_id, ctx.orgId),
                  inArray(custom_fields.project_id, ids),
                  inArray(custom_fields.slug, wantedOptions),
                ),
              )
              .orderBy(custom_field_options.name)
          : [],
      ]);
      const options: Record<string, string[]> = Object.fromEntries(wantedOptions.map(slug => [slug, []]));
      for (const row of optionRows) options[row.slug]!.push(row.name);
      return {
        projects: projectRows,
        statuses,
        priorities: priorityNames,
        types: typeNames,
        work_types: workTypeNames,
        tags: tagRows,
        sprints: sprintRows,
        usernames: usernames.map(u => ({ username: u.username, removed: u.removed_at !== null })),
        options,
      };
    },

    /** Value names for autocomplete, matched by any word prefix. */
    async suggestValues(
      ctx: TenantContext,
      projectIds: readonly number[],
      attribute: string,
      prefix: string,
      limit: number,
    ): Promise<string[]> {
      const ids = [...projectIds];
      const like = `${prefix.toLowerCase().replace(/[\\%_]/g, c => `\\${c}`)}%`;
      const wordMatch = (column: SQL) => sql`(lower(${column}) like ${like} or lower(${column}) like ${`% ${like}`})`;
      const fromProjects = async (t: typeof workflow_statuses) => {
        if (ids.length === 0) return [];
        const rows = await db
          .selectDistinct({ name: t.name })
          .from(t)
          .where(and(eq(t.org_id, ctx.orgId), inArray(t.project_id, ids), wordMatch(sql`${t.name}`)))
          .orderBy(t.name)
          .limit(limit);
        return rows.map(r => r.name);
      };
      switch (attribute) {
        case 'status':
          return fromProjects(workflow_statuses);
        case 'priority':
          return fromProjects(priorities as unknown as typeof workflow_statuses);
        case 'type':
          return fromProjects(issue_types as unknown as typeof workflow_statuses);
        case 'work type':
          return fromProjects(work_types as unknown as typeof workflow_statuses);
        case 'project': {
          if (ids.length === 0) return [];
          const rows = await db
            .select({ key: projects.key })
            .from(projects)
            .where(
              and(
                eq(projects.org_id, ctx.orgId),
                inArray(projects.id, ids),
                sql`(${wordMatch(sql`${projects.key}`)} or ${wordMatch(sql`${projects.name}`)})`,
              ),
            )
            .orderBy(projects.key)
            .limit(limit);
          return rows.map(r => r.key);
        }
        case 'tag': {
          const rows = await db
            .select({ name: tags.name })
            .from(tags)
            .where(
              and(
                eq(tags.org_id, ctx.orgId),
                sql`(${wordMatch(sql`${tags.name}`)} or ${wordMatch(sql`${tags.slug}`)})`,
              ),
            )
            .orderBy(tags.slug)
            .limit(limit);
          return rows.map(r => r.name);
        }
        case 'sprint': {
          if (ids.length === 0) return [];
          const rows = await db
            .selectDistinct({ name: sprints.name })
            .from(sprints)
            .where(
              and(eq(sprints.org_id, ctx.orgId), inArray(sprints.project_id, ids), wordMatch(sql`${sprints.name}`)),
            )
            .orderBy(sprints.name)
            .limit(limit);
          return rows.map(r => r.name);
        }
        case 'user': {
          const rows = await db
            .select({ username: org_members.username })
            .from(org_members)
            .where(
              and(
                eq(org_members.org_id, ctx.orgId),
                isNull(org_members.removed_at),
                wordMatch(sql`${org_members.username}`),
              ),
            )
            .orderBy(sql`lower(${org_members.username})`)
            .limit(limit);
          return rows.map(r => r.username);
        }
        default: {
          if (ids.length === 0) return [];
          const rows = await db
            .selectDistinct({ name: custom_field_options.name })
            .from(custom_field_options)
            .innerJoin(
              custom_fields,
              and(
                eq(custom_fields.id, custom_field_options.field_id),
                eq(custom_fields.org_id, custom_field_options.org_id),
              ),
            )
            .where(
              and(
                eq(custom_field_options.org_id, ctx.orgId),
                inArray(custom_fields.project_id, ids),
                eq(custom_fields.slug, attribute),
                eq(custom_fields.is_archived, false),
                eq(custom_field_options.is_archived, false),
                wordMatch(sql`${custom_field_options.name}`),
              ),
            )
            .orderBy(custom_field_options.name)
            .limit(limit);
          return rows.map(r => r.name);
        }
      }
    },
  };
}

export type IssueSearchRepository = ReturnType<typeof issueSearchRepository>;
