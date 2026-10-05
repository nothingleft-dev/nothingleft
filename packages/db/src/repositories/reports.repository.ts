import { sql, type SQL } from 'drizzle-orm';
import type { Query } from '@nothingleft/query';
import { RESOLVED_STATUS_CATEGORIES, type StatusCategory } from '@nothingleft/types';
import type { Queryable } from '../client.ts';
import { issues } from '../schema/index.ts';
import { issueGroupSource, type GroupSourceField } from '../search/issue-groups.ts';
import { effectiveEstimate, issueSearch } from '../search/issue-query.ts';
import type { TenantContext } from '../tenant-context.ts';
import type { SearchScope } from './issue-search.repository.ts';

/** One group of a report: the `k v l c o` of a grouping plus what was counted. */
export interface ReportGroupRow {
  /** Stable, lowercased; `''` is the empty group. */
  key: string;
  value: string | null;
  label: string | null;
  color: string | null;
  o: number | null;
  count: number;
}

export interface AgeGroupRow extends ReportGroupRow {
  average_seconds: number;
  oldest_seconds: number;
  oldest_issue_id: number | null;
}

export interface TimeGroupRow {
  key: string;
  value: string | null;
  label: string | null;
  o: number | null;
  spent_minutes: number;
  /** Only for groupings by issue or project. */
  estimate_minutes: number | null;
}

/** A calendar-date period of work dates, both ends included. */
export interface WorkPeriod {
  from: string;
  to: string;
}

export type TimeGrouping =
  | { kind: 'user' }
  | { kind: 'work_type' }
  | { kind: 'issue' }
  | { kind: 'project' }
  | { kind: 'attribute'; name: string };

export interface TimesheetEntryRow {
  id: number;
  work_date: string;
  duration_minutes: number;
  description_md: string;
  author_id: number;
  project_key: string;
  key_number: number;
  title: string;
  work_type: { name: string; short_label: string } | null;
  attributes: { attribute: string; name: string; short_label: string }[];
}

export interface GanttRow {
  id: number;
  key: string;
  title: string;
  start_date: string | null;
  due_date: string | null;
  status_name: string;
  status_category: StatusCategory;
  status_color: string;
  assignee_ids: number[];
  group_key: string | null;
  group_value: string | null;
  group_label: string | null;
}

export type GanttGrouping = 'epic' | 'assignee' | 'none';

type Rows<T> = { rows: T[] };

const resolved = sql.join(
  RESOLVED_STATUS_CATEGORIES.map(c => sql`${c}`),
  sql`, `,
);

const idList = (ids: readonly number[]) =>
  sql.join(
    ids.map(id => sql`${id}`),
    sql`, `,
  );

const num = (v: unknown): number => Number(v ?? 0);

export function reportsRepository(db: Queryable) {
  const compiler = (ctx: TenantContext, scope: SearchScope) => {
    if (ctx.userId === null) throw new Error('a report needs the caller in its TenantContext');
    return issueSearch({ ...scope, orgId: ctx.orgId, userId: ctx.userId });
  };
  const source = (ctx: TenantContext, scope: SearchScope, field: GroupSourceField) =>
    issueGroupSource(compiler(ctx, scope), { ...scope, orgId: ctx.orgId }, field);

  const groupRow = (r: {
    key: string;
    value: string | null;
    label: string | null;
    color: string | null;
    o: number | string | null;
    n: number | string;
  }): ReportGroupRow => ({
    key: r.key,
    value: r.key === '' ? null : r.value,
    label: r.key === '' ? null : r.label,
    color: r.color,
    o: r.o === null ? null : Number(r.o),
    count: num(r.n),
  });

  function timeSource(ctx: TenantContext, grouping: TimeGrouping): SQL {
    switch (grouping.kind) {
      case 'user':
        return sql`(select lower(m.username) k, m.username v, u.name l, 0 o from org_members m join users u on u.id = m.user_id where m.org_id = ${ctx.orgId} and m.user_id = w.author_id)`;
      case 'work_type':
        return sql`(select lower(wt.name) k, wt.name v, wt.name l, wt.position::int o from work_types wt where wt.id = w.work_type_id and wt.org_id = w.org_id)`;
      case 'issue':
        return sql`(select ${issues.id}::text k, p.key || '-' || ${issues.key_number} v, ${issues.title} l, 0 o from projects p where p.id = ${issues.project_id})`;
      case 'project':
        return sql`(select lower(p.key) k, p.key v, p.name l, 0 o from projects p where p.id = ${issues.project_id})`;
      case 'attribute':
        return sql`(select lower(av.name) k, av.name v, av.name l, av.position::int o from work_item_values wv
          join work_item_attributes a on a.id = wv.attribute_id and a.org_id = wv.org_id
          join work_item_attribute_values av on av.id = wv.value_id and av.org_id = wv.org_id
          where wv.work_item_id = w.id and wv.org_id = ${ctx.orgId} and lower(a.name) = lower(${grouping.name}))`;
    }
  }

  const workJoin = (ctx: TenantContext) =>
    sql`join work_items w on w.issue_id = ${issues.id} and w.org_id = ${ctx.orgId}`;
  const inPeriod = (period: WorkPeriod) => sql`w.work_date between ${period.from} and ${period.to}`;

  function ganttSource(ctx: TenantContext, grouping: GanttGrouping): SQL | null {
    switch (grouping) {
      case 'none':
        return null;
      case 'assignee':
        return sql`(select lower(m.username) k, m.username v, u.name l from issue_assignees a
          join org_members m on m.org_id = a.org_id and m.user_id = a.user_id join users u on u.id = a.user_id
          where a.issue_id = ${issues.id} and a.org_id = ${ctx.orgId} order by lower(m.username) limit 1)`;
      case 'epic':
        // The nearest live ancestor (or the issue itself) whose type is named Epic.
        return sql`(with recursive up as (
            select e.id, e.parent_id, e.type_id, 0 d from issues e where e.id = ${issues.id}
            union all
            select e.id, e.parent_id, e.type_id, up.d + 1 from issues e join up on e.id = up.parent_id
            where up.d < 5 and e.org_id = ${ctx.orgId} and e.deleted_at is null)
          select up.id::text k, pp.key || '-' || e2.key_number v, e2.title l from up
          join issue_types t on t.id = up.type_id join issues e2 on e2.id = up.id join projects pp on pp.id = e2.project_id
          where lower(t.name) = 'epic' order by up.d limit 1)`;
    }
  }

  return {
    /** Counts per value of `field` over the scoped query; a multi-valued field counts an issue once per value. */
    async distribution(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      field: GroupSourceField,
    ): Promise<{ groups: ReportGroupRow[]; total: number; multi_valued: number }> {
      const where = compiler(ctx, scope).where(query);
      const g = source(ctx, scope, field);
      const [grouped, totals, multi] = await Promise.all([
        db.execute(sql`select coalesce(g.k, '') as key, min(g.v) as value, min(g.l) as label, min(g.c) as color,
            min(g.o) as o, count(*)::int as n
            from ${issues} left join lateral ${g} g on true where ${where} group by 1`) as Promise<
          Rows<{ key: string; value: string | null; label: string | null; color: string | null; o: number; n: number }>
        >,
        db.execute(sql`select count(*)::int as n from ${issues} where ${where}`) as Promise<Rows<{ n: number }>>,
        db.execute(sql`select count(*)::int as n from (select ${issues.id} from ${issues} join lateral ${g} g on true
            where ${where} group by ${issues.id} having count(*) > 1) x`) as Promise<Rows<{ n: number }>>,
      ]);
      return {
        groups: grouped.rows.map(groupRow),
        total: num(totals.rows[0]?.n),
        multi_valued: num(multi.rows[0]?.n),
      };
    },

    /** Counts per pair of values; the axes' own totals come from `distribution`. */
    async matrix(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      rowField: GroupSourceField,
      columnField: GroupSourceField,
    ): Promise<{ row_key: string; column_key: string; count: number }[]> {
      const where = compiler(ctx, scope).where(query);
      const result = (await db.execute(sql`select coalesce(r.k, '') as rk, coalesce(c.k, '') as ck, count(*)::int as n
          from ${issues} left join lateral ${source(ctx, scope, rowField)} r on true
          left join lateral ${source(ctx, scope, columnField)} c on true
          where ${where} group by 1, 2`)) as Rows<{ rk: string; ck: string; n: number }>;
      return result.rows.map(r => ({ row_key: r.rk, column_key: r.ck, count: num(r.n) }));
    },

    /** Every status name of the given projects with its category. */
    async statuses(
      ctx: TenantContext,
      projectIds: readonly number[],
    ): Promise<{ project_id: number; name: string; category: StatusCategory }[]> {
      if (projectIds.length === 0) return [];
      const result = (await db.execute(sql`select project_id, name, category from workflow_statuses
          where org_id = ${ctx.orgId} and project_id in (${idList(projectIds)}) order by position`)) as Rows<{
        project_id: number | string;
        name: string;
        category: StatusCategory;
      }>;
      return result.rows.map(r => ({ project_id: Number(r.project_id), name: r.name, category: r.category }));
    },

    /** Age from creation to resolution, or to `scope.now` while open, per group; `field` null is one overall row. */
    async age(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      field: GroupSourceField | null,
      unresolvedOnly: boolean,
    ): Promise<AgeGroupRow[]> {
      const where = compiler(ctx, scope).where(query);
      const now = scope.now.toISOString();
      const age = sql`extract(epoch from (coalesce(${issues.resolved_at}, ${now}::timestamptz) - ${issues.created_at}))`;
      const open = unresolvedOnly ? sql`and s.category not in (${resolved})` : sql``;
      const g = field
        ? source(ctx, scope, field)
        : sql`(select ''::text k, null::text v, null::text l, null::text c, 0 o)`;
      const result = (await db.execute(sql`select coalesce(g.k, '') as key, min(g.v) as value, min(g.l) as label,
          min(g.c) as color, min(g.o) as o, count(*)::int as n,
          avg(${age})::float8 as avg_s, max(${age})::float8 as max_s,
          (array_agg(${issues.id} order by ${age} desc, ${issues.id}))[1] as oldest
          from ${issues} join workflow_statuses s on s.id = ${issues.status_id}
          left join lateral ${g} g on true
          where ${where} ${open} group by 1`)) as Rows<{
        key: string;
        value: string | null;
        label: string | null;
        color: string | null;
        o: number | null;
        n: number;
        avg_s: number | null;
        max_s: number | null;
        oldest: number | string | null;
      }>;
      return result.rows.map(r => ({
        ...groupRow(r),
        average_seconds: num(r.avg_s),
        oldest_seconds: num(r.max_s),
        oldest_issue_id: r.oldest === null ? null : Number(r.oldest),
      }));
    },

    /** Work items logged in the period on issues in scope, summed per group; never `spent_minutes`. */
    async time(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      period: WorkPeriod,
      grouping: TimeGrouping,
    ): Promise<TimeGroupRow[]> {
      const where = compiler(ctx, scope).where(query);
      const g = timeSource(ctx, grouping);
      const perIssue = grouping.kind === 'issue' || grouping.kind === 'project';
      const estimate = perIssue ? sql`${effectiveEstimate(ctx.orgId, 'issues')}` : sql`null::double precision`;
      const result = (await db.execute(sql`with t as (
            select ${issues.id} as issue_id, g.k, g.v, g.l, g.o, sum(w.duration_minutes)::bigint as spent, ${estimate} as est
            from ${issues} ${workJoin(ctx)} left join lateral ${g} g on true
            where ${where} and ${inPeriod(period)}
            group by ${issues.id}, g.k, g.v, g.l, g.o)
          select coalesce(k, '') as key, min(v) as value, min(l) as label, min(o) as o,
            sum(spent)::bigint as spent, ${perIssue ? sql`sum(est)::float8` : sql`null::float8`} as est
          from t group by 1`)) as Rows<{
        key: string;
        value: string | null;
        label: string | null;
        o: number | null;
        spent: number | string;
        est: number | null;
      }>;
      return result.rows.map(r => ({
        key: r.key,
        value: r.key === '' ? null : r.value,
        label: r.key === '' ? null : r.label,
        o: r.o === null ? null : Number(r.o),
        spent_minutes: num(r.spent),
        estimate_minutes: perIssue ? Math.round(num(r.est)) : null,
      }));
    },

    /** Minutes per author per work date in the period; `authorIds` null is every author. */
    async timesheet(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      period: WorkPeriod,
      authorIds: readonly number[] | null,
    ): Promise<{ author_id: number; work_date: string; minutes: number }[]> {
      if (authorIds && authorIds.length === 0) return [];
      const where = compiler(ctx, scope).where(query);
      const authors = authorIds ? sql`and w.author_id in (${idList(authorIds)})` : sql``;
      const result = (await db.execute(sql`select w.author_id, w.work_date::text as work_date,
          sum(w.duration_minutes)::bigint as minutes
          from ${issues} ${workJoin(ctx)} where ${where} and ${inPeriod(period)} ${authors} group by 1, 2`)) as Rows<{
        author_id: number | string;
        work_date: string;
        minutes: number | string;
      }>;
      return result.rows.map(r => ({
        author_id: Number(r.author_id),
        work_date: r.work_date,
        minutes: num(r.minutes),
      }));
    },

    /** One author's work items in the period on issues in scope: a timesheet cell's drill-down. */
    async timesheetEntries(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      period: WorkPeriod,
      authorId: number,
      page: { limit: number; offset: number },
    ): Promise<{ rows: TimesheetEntryRow[]; total: number }> {
      const where = compiler(ctx, scope).where(query);
      const filter = sql`${where} and ${inPeriod(period)} and w.author_id = ${authorId}`;
      const [list, count] = await Promise.all([
        db.execute(sql`select w.id, w.work_date::text as work_date, w.duration_minutes, w.description_md, w.author_id,
            p.key as project_key, ${issues.key_number} as key_number, ${issues.title} as title,
            wt.name as wt_name, wt.short_label as wt_short,
            (select coalesce(json_agg(json_build_object('attribute', a.name, 'name', av.name, 'short_label', av.short_label)
                order by a.position), '[]'::json)
              from work_item_values wv
              join work_item_attributes a on a.id = wv.attribute_id and a.org_id = wv.org_id
              join work_item_attribute_values av on av.id = wv.value_id and av.org_id = wv.org_id
              where wv.work_item_id = w.id and wv.org_id = w.org_id) as attrs
            from ${issues} ${workJoin(ctx)}
            join projects p on p.id = ${issues.project_id}
            left join work_types wt on wt.id = w.work_type_id and wt.org_id = w.org_id
            where ${filter} order by w.work_date, w.id limit ${page.limit} offset ${page.offset}`) as Promise<
          Rows<{
            id: number | string;
            work_date: string;
            duration_minutes: number;
            description_md: string;
            author_id: number | string;
            project_key: string;
            key_number: number;
            title: string;
            wt_name: string | null;
            wt_short: string | null;
            attrs: { attribute: string; name: string; short_label: string }[];
          }>
        >,
        db.execute(sql`select count(*)::int as n from ${issues} ${workJoin(ctx)} where ${filter}`) as Promise<
          Rows<{ n: number }>
        >,
      ]);
      return {
        rows: list.rows.map(r => ({
          id: Number(r.id),
          work_date: r.work_date,
          duration_minutes: num(r.duration_minutes),
          description_md: r.description_md,
          author_id: Number(r.author_id),
          project_key: r.project_key,
          key_number: num(r.key_number),
          title: r.title,
          work_type: r.wt_name === null ? null : { name: r.wt_name, short_label: r.wt_short ?? '' },
          attributes: r.attrs ?? [],
        })),
        total: num(count.rows[0]?.n),
      };
    },

    /** Issues with both dates (bars) and those missing either, each up to `limit`, plus the depends links among them. */
    async gantt(
      ctx: TenantContext,
      scope: SearchScope,
      query: Query,
      grouping: GanttGrouping,
      limit: number,
    ): Promise<{
      bars: GanttRow[];
      bar_count: number;
      missing: GanttRow[];
      missing_count: number;
      links: { from_id: number; to_id: number }[];
    }> {
      const where = compiler(ctx, scope).where(query);
      const g = ganttSource(ctx, grouping);
      const lateral = g ? sql`left join lateral ${g} g on true` : sql``;
      const groupColumns = g
        ? sql`g.k as gk, g.v as gv, g.l as gl`
        : sql`null::text as gk, null::text as gv, null::text as gl`;
      const dated = sql`${issues.start_date} is not null and ${issues.due_date} is not null`;
      const select = (condition: SQL) =>
        db.execute(sql`select ${issues.id} as id, p.key || '-' || ${issues.key_number} as key, ${issues.title} as title,
            ${issues.start_date}::text as start_date, ${issues.due_date}::text as due_date,
            s.name as status_name, s.category as status_category, s.color as status_color,
            (select coalesce(array_agg(a.user_id order by lower(m.username)), '{}') from issue_assignees a
              join org_members m on m.org_id = a.org_id and m.user_id = a.user_id
              where a.issue_id = ${issues.id} and a.org_id = ${ctx.orgId}) as assignee_ids,
            ${groupColumns}
            from ${issues} join projects p on p.id = ${issues.project_id}
            join workflow_statuses s on s.id = ${issues.status_id} ${lateral}
            where ${where} and ${condition}
            order by ${issues.start_date} nulls last, ${issues.due_date} nulls last, ${issues.id}
            limit ${limit}`) as Promise<
          Rows<{
            id: number | string;
            key: string;
            title: string;
            start_date: string | null;
            due_date: string | null;
            status_name: string;
            status_category: StatusCategory;
            status_color: string;
            assignee_ids: (number | string)[];
            gk: string | null;
            gv: string | null;
            gl: string | null;
          }>
        >;
      const [bars, missing, counts] = await Promise.all([
        select(dated),
        select(sql`not (${dated})`),
        db.execute(sql`select count(*) filter (where ${dated})::int as bars, count(*) filter (where not (${dated}))::int as missing
            from ${issues} where ${where}`) as Promise<Rows<{ bars: number; missing: number }>>,
      ]);
      const toRow = (r: (typeof bars.rows)[number]): GanttRow => ({
        id: Number(r.id),
        key: r.key,
        title: r.title,
        start_date: r.start_date,
        due_date: r.due_date,
        status_name: r.status_name,
        status_category: r.status_category,
        status_color: r.status_color,
        assignee_ids: (r.assignee_ids ?? []).map(Number),
        group_key: r.gk,
        group_value: r.gv,
        group_label: r.gl,
      });
      const ids = [...bars.rows, ...missing.rows].map(r => Number(r.id));
      const links =
        ids.length === 0
          ? { rows: [] }
          : ((await db.execute(sql`select from_issue_id, to_issue_id from issue_links
              where org_id = ${ctx.orgId} and type = 'depends'
              and from_issue_id in (${idList(ids)}) and to_issue_id in (${idList(ids)})`)) as Rows<{
              from_issue_id: number | string;
              to_issue_id: number | string;
            }>);
      return {
        bars: bars.rows.map(toRow),
        bar_count: num(counts.rows[0]?.bars),
        missing: missing.rows.map(toRow),
        missing_count: num(counts.rows[0]?.missing),
        links: links.rows.map(l => ({ from_id: Number(l.from_issue_id), to_id: Number(l.to_issue_id) })),
      };
    },

    /** Issue keys by id, for the ids a report names (the oldest issue of an age group). */
    async issueKeys(ctx: TenantContext, ids: readonly number[]): Promise<Map<number, string>> {
      if (ids.length === 0) return new Map();
      const result = (await db.execute(sql`select i.id, p.key || '-' || i.key_number as key from issues i
          join projects p on p.id = i.project_id where i.org_id = ${ctx.orgId} and i.id in (${idList(ids)})`)) as Rows<{
        id: number | string;
        key: string;
      }>;
      return new Map(result.rows.map(r => [Number(r.id), r.key]));
    },
  };
}

export type ReportsRepository = ReturnType<typeof reportsRepository>;
