import { sql, type SQL } from 'drizzle-orm';
import { resolveDatePeriod } from '@nothingleft/query';
import {
  CUSTOM_GROUP_PREFIX,
  DUE_BUCKETS,
  STATUS_CATEGORIES,
  type IssueGroupBy,
  type IssueGroupField,
  type StatusCategory,
} from '@nothingleft/types';
import { issues } from '../schema/index.ts';
import type { IssueSearch, IssueSearchScope } from './issue-query.ts';

export const STATUS_RANK_STEP = 1000;

// A status group's order is `category rank × 1000 + position`, so its category is recoverable from it.
export const statusCategoryOf = (order: number | null): StatusCategory | null =>
  order === null ? null : (STATUS_CATEGORIES[Math.floor(Number(order) / STATUS_RANK_STEP) - 1] ?? null);

const SPRINT_STATE_ORDER = sql.raw(`array['active','planned','completed']`);
const CATEGORY_RANK = sql.raw(`array[${STATUS_CATEGORIES.map(c => `'${c}'`).join(',')}]`);

/** Status categories as a grouping, merged across projects: reports' *group by category*. */
export const STATUS_CATEGORY_GROUP = 'status_category';
export type GroupSourceField = IssueGroupBy | typeof STATUS_CATEGORY_GROUP;

/**
 * A lateral subquery of an issue's values for one grouping, as rows `k v l c o`: a stable
 * lower-cased key, the searchable value, the label, the label colour and the display order.
 * The issue list, board and every report group through this one definition.
 */
export function issueGroupSource(
  compiled: IssueSearch,
  scope: Pick<IssueSearchScope, 'orgId' | 'today' | 'weekStartsOn'>,
  field: GroupSourceField,
): SQL {
  const orgId = scope.orgId;
  if (field === STATUS_CATEGORY_GROUP) {
    return sql`(select s.category k, s.category v, null::text l, null::text c, array_position(${CATEGORY_RANK}, s.category) * ${sql.raw(String(STATUS_RANK_STEP))} o from workflow_statuses s where s.id = ${issues.status_id})`;
  }
  if (field.startsWith(CUSTOM_GROUP_PREFIX)) {
    const source = compiled.customGroup(field.slice(CUSTOM_GROUP_PREFIX.length));
    if (!source) throw new Error(`custom field ${field} cannot group`);
    return source;
  }
  switch (field as IssueGroupField) {
    case 'project':
      return sql`(select lower(p.key) k, p.key v, p.name l, null::text c, 0 o from projects p where p.id = ${issues.project_id})`;
    case 'status':
      return sql`(select lower(s.name) k, s.name v, s.name l, s.color c, array_position(${CATEGORY_RANK}, s.category) * ${sql.raw(String(STATUS_RANK_STEP))} + s.position o from workflow_statuses s where s.id = ${issues.status_id})`;
    case 'priority':
      return sql`(select lower(x.name) k, x.name v, x.name l, x.color c, x.position::int o from priorities x where x.id = ${issues.priority_id})`;
    case 'type':
      return sql`(select lower(x.name) k, x.name v, x.name l, x.color c, x.position::int o from issue_types x where x.id = ${issues.type_id})`;
    case 'assignee':
      return sql`(select lower(m.username) k, m.username v, u.name l, null::text c, 0 o from issue_assignees a join org_members m on m.org_id = a.org_id and m.user_id = a.user_id join users u on u.id = a.user_id where a.issue_id = ${issues.id} and a.org_id = ${orgId})`;
    case 'tag':
      return sql`(select tg.slug k, tg.name v, tg.name l, tg.color c, 0 o from issue_tags it join tags tg on tg.id = it.tag_id and tg.org_id = it.org_id where it.issue_id = ${issues.id} and it.org_id = ${orgId})`;
    case 'sprint':
      return sql`(select sp.slug k, sp.name v, sp.name l, null::text c, array_position(${SPRINT_STATE_ORDER}, sp.state) o from sprints sp where sp.id = ${issues.sprint_id})`;
    case 'due': {
      const week = resolveDatePeriod({ kind: 'keyword', keyword: 'this week' }, scope)!;
      const bucket = sql`case when ${issues.due_date} is null then null when ${issues.due_date} < ${scope.today} then 'overdue' when ${issues.due_date} = ${scope.today} then 'today' when ${issues.due_date} <= ${week.end} then 'this_week' else 'later' end`;
      return sql`(select b.k, b.k v, null::text l, null::text c, array_position(array[${sql.join(
        DUE_BUCKETS.map(b => sql`${b}`),
        sql`,`,
      )}]::text[], b.k) o from (select ${bucket} k) b where b.k is not null)`;
    }
  }
}

/** Groups in display order: by `o`, then label, the empty group last. */
export function byDisplayOrder<T extends { key: string; o: number | null; label: string | null; value: string | null }>(
  rows: T[],
): T[] {
  return rows.sort(
    (a, b) =>
      Number(a.key === '') - Number(b.key === '') ||
      (a.o ?? 0) - (b.o ?? 0) ||
      (a.label ?? a.value ?? '').localeCompare(b.label ?? b.value ?? ''),
  );
}
