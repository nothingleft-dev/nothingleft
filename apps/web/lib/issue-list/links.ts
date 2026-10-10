import type { Route } from 'next';
import type { DueBucket } from '@nothingleft/types';
import { DEFAULT_GROUP, writeListState, type GroupChoice } from '@lib/issue-list/url-state';

/** The list a dashboard figure links to: every number opens the query that produced it. */
export function listHref(q: string, options: { project?: string; group?: GroupChoice; sort?: string } = {}): Route {
  const base = options.project ? `/projects/${options.project}/issues` : '/issues';
  return `${base}${writeListState({ q, view: null, group: options.group ?? DEFAULT_GROUP, sort: options.sort ?? '' })}` as Route;
}

export const MY_OPEN = 'assignee: me #Unresolved';
export const OVERDUE = '#Unresolved due date: .. Yesterday';
export const DUE_TODAY = '#Unresolved due date: Today';
export const UNASSIGNED = '#Unresolved assignee: Unassigned';
export const RESOLVED_7D = '#Resolved resolved date: {minus 7d} .. Now';
export const CREATED_7D = 'created: {minus 7d} .. Now';

/** Each `group_by=due` group as a query, so one group opens on its own; `none` is the empty group. */
export const DUE_GROUP_QUERY: Record<DueBucket | 'none', string> = {
  overdue: 'due date: .. Yesterday',
  today: 'due date: Today',
  this_week: 'due date: Tomorrow .. {This week}',
  later: 'due date: {Next week} .. *',
  none: 'due date: {No due date}',
};
