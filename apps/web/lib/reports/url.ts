import type { ReportName } from '@nothingleft/types';
import type { ReportQuery } from '@lib/api/reports';

const SCOPE = ['q', 'view', 'projects'] as const;
const PERIOD = ['period', 'from', 'to'] as const;

/** The URL carries the API's own parameter names, so the address is the request. */
export const REPORT_PARAMS: Record<ReportName, readonly string[]> = {
  'issues-per-assignee': [...SCOPE, 'include_unassigned'],
  'issues-per-project': SCOPE,
  'issues-per-field': [...SCOPE, 'field', 'by_category'],
  matrix: [...SCOPE, 'row_field', 'column_field'],
  burndown: ['project', 'sprint', 'measure'],
  'average-age': [...SCOPE, 'group_by', 'unresolved_only'],
  time: [...SCOPE, ...PERIOD, 'group_by'],
  gantt: ['project', 'q', 'view', 'group_by'],
  timesheet: [...SCOPE, ...PERIOD, 'users'],
};

/** Values the URL leaves out: the API's defaults, and the web's choice where the API has none. */
export const REPORT_DEFAULTS: Record<ReportName, Readonly<Record<string, string>>> = {
  'issues-per-assignee': { include_unassigned: 'true' },
  'issues-per-project': {},
  'issues-per-field': { field: 'status', by_category: 'false' },
  matrix: { row_field: 'status', column_field: 'assignee' },
  burndown: { measure: 'story_points' },
  'average-age': { group_by: 'none', unresolved_only: 'true' },
  time: { group_by: 'work_type' },
  gantt: { group_by: 'none' },
  timesheet: {},
};

/** `/timesheets` means the viewer until someone else is chosen; `*` is everyone. */
export const EVERYONE = '*';

export type ReportChanges = Record<string, string | null>;

export function readParam(name: ReportName, params: URLSearchParams, key: string): string {
  return params.get(key) ?? REPORT_DEFAULTS[name][key] ?? '';
}

/**
 * What the API is asked. A burndown's sprint travels as `PROJ/<sprint>` (frontend-guide.md
 * § Routes), which the API takes as two parameters.
 */
export function reportQuery(name: ReportName, params: URLSearchParams, me: string | null): ReportQuery {
  const out: Record<string, string> = {};
  for (const key of REPORT_PARAMS[name]) {
    const value = readParam(name, params, key);
    if (value) out[key] = value;
  }
  if (name === 'burndown' && out.sprint) {
    const slash = out.sprint.indexOf('/');
    if (slash > 0) {
      out.project = out.sprint.slice(0, slash);
      out.sprint = out.sprint.slice(slash + 1);
    }
  }
  if (name === 'timesheet') {
    if (out.users === EVERYONE) delete out.users;
    else if (!out.users && me) out.users = me;
  }
  return Object.fromEntries(Object.entries(out).toSorted(([a], [b]) => a.localeCompare(b)));
}

/** The next address: `null` or a default removes the parameter, so a bare report stays bare. */
export function nextSearch(name: ReportName, params: URLSearchParams, changes: ReportChanges): string {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '' || REPORT_DEFAULTS[name][key] === value) next.delete(key);
    else next.set(key, value);
  }
  const text = next.toString();
  return text ? `?${text}` : '';
}

export const burndownSprintParam = (project: string, sprint: string) => `${project}/${sprint}`;
