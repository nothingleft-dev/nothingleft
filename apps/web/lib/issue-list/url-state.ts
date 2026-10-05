import { CUSTOM_FIELD_SLUG_PATTERN, ISSUE_GROUP_FIELDS, type IssueGroupBy } from '@nothingleft/types';

export type GroupChoice = IssueGroupBy | 'none';

export interface ListUrlState {
  q: string;
  /** The saved view whose tab is active, if any. */
  view: string | null;
  group: GroupChoice;
  /** The `sort by:` value list sent as `sort=`; empty means the query's own order. */
  sort: string;
}

export const DEFAULT_GROUP: GroupChoice = 'status';

const isGroup = (value: string): value is IssueGroupBy =>
  (ISSUE_GROUP_FIELDS as readonly string[]).includes(value) ||
  (value.startsWith('custom:') && CUSTOM_FIELD_SLUG_PATTERN.test(value.slice('custom:'.length)));

export function readListState(params: URLSearchParams): ListUrlState {
  const group = params.get('group');
  return {
    q: params.get('q') ?? '',
    view: params.get('view'),
    group: group === 'none' ? 'none' : group && isGroup(group) ? group : DEFAULT_GROUP,
    sort: params.get('sort') ?? '',
  };
}

/** The URL mirrors the query: defaults are left out so a bare `/issues` stays bare. */
export function writeListState(state: ListUrlState, keep: URLSearchParams = new URLSearchParams()): string {
  const params = new URLSearchParams(keep);
  for (const key of ['q', 'view', 'group', 'sort', 'focus']) params.delete(key);
  if (state.q) params.set('q', state.q);
  if (state.view) params.set('view', state.view);
  if (state.group !== DEFAULT_GROUP) params.set('group', state.group);
  if (state.sort) params.set('sort', state.sort);
  const text = params.toString();
  return text ? `?${text}` : '';
}
