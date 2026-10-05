import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import { formatDuration, type WorkCalendar } from '@nothingleft/format';
import {
  BURNDOWN_MEASURES,
  REPORT_NAMES,
  type AverageAgeReport,
  type BurndownReport,
  type DistributionReport,
  type GanttBar,
  type GanttReport,
  type MatrixReport,
  type ReportEmpty,
  type ReportGroup,
  type ReportName,
  type ReportScope,
  type TimeReport,
  type TimesheetReport,
  type TimesheetWorkItem,
} from '@nothingleft/types';
import * as arg from '../args.ts';
import { ToolError } from '../errors.ts';
import { resolveOrganization } from '../organizations.ts';
import { resolveUsername } from '../resolve.ts';
import { code, date, handle, join, more, person, table, untrusted } from '../render.ts';
import { defineTool, type ToolContext } from '../tool.ts';

const SCOPE = ['query', 'view', 'projects'] as const;
const PERIOD = ['period', 'from', 'to'] as const;

/** Which arguments each report takes, and which it needs; anything else is refused by name. */
const ARGUMENTS: Record<ReportName, { takes: readonly string[]; needs: readonly string[] }> = {
  'issues-per-assignee': { takes: [...SCOPE, 'include_unassigned'], needs: [] },
  'issues-per-project': { takes: SCOPE, needs: [] },
  'issues-per-field': { takes: [...SCOPE, 'field', 'by_category'], needs: ['field'] },
  matrix: { takes: [...SCOPE, 'row_field', 'column_field'], needs: ['row_field', 'column_field'] },
  burndown: { takes: ['project', 'sprint', 'measure'], needs: ['project'] },
  'average-age': { takes: [...SCOPE, 'group_by', 'unresolved_only'], needs: [] },
  time: { takes: [...SCOPE, ...PERIOD, 'group_by'], needs: [] },
  gantt: { takes: ['project', 'query', 'view', 'group_by'], needs: ['project'] },
  timesheet: { takes: [...SCOPE, ...PERIOD, 'users', 'user', 'limit', 'offset'], needs: [] },
};

const TITLES: Record<ReportName, string> = {
  'issues-per-assignee': 'Issues per assignee',
  'issues-per-project': 'Issues per project',
  'issues-per-field': 'Issues per field',
  matrix: 'Matrix',
  burndown: 'Burndown',
  'average-age': 'Average issue age',
  time: 'Time report',
  gantt: 'Gantt chart',
  timesheet: 'Timesheet',
};

const fieldArg = (what: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(60)
    .describe(
      `${what}: project, status, priority, type, assignee, tag, sprint, due, or custom:<slug> for a select, multi-select, user, multi-user or checkbox field.`,
    );

const input = z.strictObject({
  report: z
    .enum(REPORT_NAMES)
    .describe(
      'issues-per-assignee, issues-per-project, issues-per-field (`field`), matrix (`row_field`, `column_field`), burndown (`project`, `sprint`, `measure`), average-age (`group_by`), time (`group_by`, period), gantt (`project`, `group_by`), timesheet (`users`, period; `user` with a one-day period lists that cell’s work items).',
    ),
  query: z
    .string()
    .max(2000)
    .optional()
    .describe(
      'Scope, in the search query language, e.g. `type: Bug #Unresolved`; `sprint: {Sprint 14}` scopes to a sprint.',
    ),
  view: z.string().trim().min(1).max(100).optional().describe('A saved view by name, ANDed with `query`.'),
  projects: z.array(arg.project).max(100).optional().describe('Narrow to these project keys.'),
  project: arg.project.optional().describe('burndown and gantt: the project.'),
  field: fieldArg('issues-per-field groups by').optional(),
  by_category: z.boolean().optional().describe('issues-per-field on status: the five status categories instead.'),
  row_field: fieldArg('matrix rows').optional(),
  column_field: fieldArg('matrix columns').optional(),
  include_unassigned: z.boolean().optional().describe('issues-per-assignee: false leaves Unassigned out.'),
  unresolved_only: z.boolean().optional().describe('average-age: default true; false also measures resolved issues.'),
  group_by: z
    .string()
    .trim()
    .min(1)
    .max(110)
    .optional()
    .describe(
      'average-age: a field as for `field`, or none. time: work_type (default), user, issue, project, or attribute:<Name>. gantt: epic, assignee or none.',
    ),
  sprint: arg.sprint.optional().describe('burndown: sprint by name or slug; default the active one.'),
  measure: z
    .enum(BURNDOWN_MEASURES)
    .optional()
    .describe('burndown: story_points (default), issue_count, remaining_estimate.'),
  period: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('time, timesheet: `Last week`, `This month`, `2026-09`, `2026-09-01 .. 2026-09-14`. Default This week.'),
  from: arg.calendarDate.optional().describe('time, timesheet: first day, with `to`, instead of `period`.'),
  to: arg.calendarDate.optional(),
  users: arg.people('timesheet: whose rows').optional(),
  user: arg.person.optional().describe('timesheet: list this person’s work items in the period instead of the grid.'),
  org: arg.org,
  limit: arg.limit,
  offset: arg.offset,
});
type Args = z.output<typeof input>;

async function username(ctx: ToolContext, args: Args, who: string): Promise<string> {
  const trimmed = who.trim();
  if (trimmed.startsWith('@')) return trimmed.slice(1);
  if (trimmed.toLowerCase() === 'me') return 'me';
  return resolveUsername(ctx, await resolveOrganization(ctx, args.org), trimmed);
}

function checkArguments(args: Args) {
  const { takes, needs } = ARGUMENTS[args.report];
  const given = Object.entries(args)
    .filter(([name, value]) => value !== undefined && name !== 'report' && name !== 'org')
    .map(([name]) => name);
  const stray = given.filter(name => !takes.includes(name));
  const missing = needs.filter(name => args[name as keyof Args] === undefined);
  if (stray.length === 0 && missing.length === 0) return;
  throw ToolError.local(
    'mcp.invalid_arguments',
    { tool: 'run_report' },
    {
      hints: [
        ...(stray.length
          ? [t('mcp.hint.unknown_arguments', { names: stray.join(', '), valid: [...takes, 'org'].join(', ') })]
          : []),
        ...missing.map(name => t('mcp.hint.required', { name })),
      ],
    },
  );
}

const calendarOf = (c: { workday_minutes: number; workweek_days: number }): WorkCalendar => ({
  workdayMinutes: c.workday_minutes,
  workweekDays: c.workweek_days,
});
const signed = (minutes: number | null, calendar: WorkCalendar) =>
  minutes === null ? '—' : minutes < 0 ? `-${formatDuration(-minutes, calendar)}` : formatDuration(minutes, calendar);
const series = (slot: number | null, other = false) => (other || slot === null ? 'Other' : String(slot));
const percent = (share: number) => `${share}%`;
const issues = (n: number) => `${n} ${n === 1 ? 'issue' : 'issues'}`;

function scopeLine(title: string, scope: ReportScope, lead: string | null): string {
  const parts = [
    lead,
    scope.projects.length ? `in ${scope.projects.map(p => p.key).join(', ')}` : null,
    scope.view ? `view ${code(scope.view)}` : null,
    scope.query ? `for ${code(scope.query)}` : null,
    scope.period ? `${date(scope.period.from)} – ${date(scope.period.to)}` : null,
  ].filter(Boolean);
  return `**${title}**${parts.length ? ` — ${parts.join(', ')}` : ''}`;
}

function emptyBlock(empty: ReportEmpty | null): string | null {
  if (!empty) return null;
  const widen = empty.filters.map(f =>
    f.widen_query === null
      ? `- drop ${code(f.label)}`
      : `- drop ${code(f.label)}: query ${code(f.widen_query || '(none)')}`,
  );
  return join(`**Nothing to report.** ${empty.message}`, widen.length ? `To widen:\n${widen.join('\n')}` : null);
}

function seriesNote(groups: readonly Pick<ReportGroup, 'series' | 'other'>[], unit: string, folded: number | null) {
  const drawn = groups.filter(g => g.series !== null && !g.other).length;
  if (drawn === 0) return null;
  const drawnText = drawn === 1 ? 'one series' : `series 1–${drawn}, the ${drawn} largest in their own order`;
  return `Chart: ${drawnText}${folded ? `; the rest fold into Other (${folded} ${unit})` : ''}. The table is the series.`;
}

function renderDistribution(r: DistributionReport): string {
  const multi =
    r.total_counted !== r.total_issues
      ? `${issues(r.total_issues)}; ${r.multi_valued_issues} ${r.multi_valued_issues === 1 ? 'has' : 'have'} more than one value, so the groups add up to ${r.total_counted}.`
      : `${issues(r.total_issues)}.`;
  return join(
    scopeLine(TITLES[r.report], r.scope, r.report === 'issues-per-field' ? `by ${r.field}` : null),
    emptyBlock(r.empty),
    r.groups.length
      ? table(
          ['Group', 'Issues', 'Share', 'Series', 'Search with'],
          r.groups.map(g => [
            g.label,
            String(g.count),
            percent(g.share),
            series(g.series),
            g.query ? code(g.query) : '—',
          ]),
        )
      : null,
    r.groups.length ? multi : null,
    seriesNote(r.groups, 'issues', r.other?.count ?? null),
    r.by_category_available && !r.by_category
      ? 'These projects name their statuses differently: pass `by_category: true` to add them up by category.'
      : null,
    r.truncated ? 'Only the 500 largest groups are listed.' : null,
  );
}

function renderMatrix(r: MatrixReport): string {
  const counts = new Map(r.cells.map(c => [`${c.row}:${c.column}`, c.count]));
  const rowTotal = (i: number) => r.columns.groups.reduce((sum, _, c) => sum + (counts.get(`${i}:${c}`) ?? 0), 0);
  return join(
    scopeLine('Matrix', r.scope, `${r.rows.field} × ${r.columns.field}`),
    emptyBlock(r.empty),
    r.rows.groups.length
      ? table(
          [r.rows.field, ...r.columns.groups.map(g => g.label), 'Total'],
          [
            ...r.rows.groups.map((g, i) => [
              g.label,
              ...r.columns.groups.map((_, c) => String(counts.get(`${i}:${c}`) ?? 0)),
              String(rowTotal(i)),
            ]),
            ['Total', ...r.columns.groups.map(g => String(g.count)), String(r.total_issues)],
          ],
        )
      : null,
    r.rows.groups.length
      ? `Stacked bar series by ${r.columns.field}: ${r.columns.groups
          .map(g => `${series(g.series, g.other)} ${g.label}`)
          .join(
            ', ',
          )}. Totals count distinct issues${r.multi_valued ? '; a multi-valued field counts an issue in each of its values' : ''}.`
      : null,
  );
}

function renderBurndown(r: BurndownReport): string {
  const calendar = calendarOf(r.calendar);
  const value = (n: number | null) =>
    n === null ? '—' : r.unit === 'minutes' ? formatDuration(n, calendar) : String(n);
  const s = r.summary;
  return join(
    scopeLine(`Burndown of ${r.sprint.name}`, r.scope, `${r.measure.replace('_', ' ')}, ${r.sprint.state}`),
    emptyBlock(r.empty),
    r.days.length
      ? table(
          ['Date', 'Remaining', 'Ideal', 'Scope', 'Scope added', 'Completed'],
          r.days.map(d => [
            `${date(d.date)}${d.live ? ' (now)' : ''}${d.working_day ? '' : ' ·'}`,
            value(d.remaining),
            value(d.ideal),
            value(d.scope),
            d.scope_added === null ? '—' : `${d.scope_added > 0 ? '+' : ''}${value(d.scope_added)}`,
            value(d.completed),
          ]),
        )
      : null,
    r.days.length
      ? `Started with ${value(s.start_scope)}; scope is now ${value(s.scope)} (${
          (s.scope_added ?? 0) >= 0 ? '+' : ''
        }${value(s.scope_added)} since the start), ${value(s.completed)} completed, ${value(s.remaining)} remaining. Series: remaining, ideal, scope and scope added; days marked · are not working days, "—" is no figure.`
      : null,
  );
}

function renderAge(r: AverageAgeReport): string {
  const days = (n: number) => `${n} days`;
  return join(
    scopeLine(
      'Average issue age',
      r.scope,
      [r.group_by ? `by ${r.group_by}` : null, r.unresolved_only ? 'unresolved issues' : 'all issues']
        .filter(Boolean)
        .join(', '),
    ),
    emptyBlock(r.empty),
    r.overall.count
      ? `Across ${r.overall.count} issues: average ${days(r.overall.average_days)}, oldest ${r.overall.oldest ?? '—'} at ${days(r.overall.oldest_days)}.`
      : null,
    r.groups.length
      ? table(
          ['Group', 'Issues', 'Average age', 'Oldest', 'Series'],
          r.groups.map(g => [
            g.label,
            String(g.count),
            days(g.average_days),
            g.oldest ? `${g.oldest} (${days(g.oldest_days)})` : '—',
            series(g.series),
          ]),
        )
      : null,
  );
}

function renderTime(r: TimeReport): string {
  const calendar = calendarOf(r.calendar);
  const withEstimate = r.totals.estimate_minutes !== null;
  const headers = ['Group', 'Spent', ...(withEstimate ? ['Estimate', 'Difference'] : []), 'Share', 'Series'];
  const custom = r.estimate_sources.filter(s => s.field);
  return join(
    scopeLine('Time report', r.scope, `by ${r.group_by}`),
    emptyBlock(r.empty),
    r.rows.length
      ? table(headers, [
          ...r.rows.map(row => [
            row.value && row.value !== row.label ? `${row.value} ${row.label}` : row.label,
            signed(row.spent_minutes, calendar),
            ...(withEstimate ? [signed(row.estimate_minutes, calendar), signed(row.difference_minutes, calendar)] : []),
            percent(row.share),
            series(row.series),
          ]),
          [
            'Total',
            signed(r.totals.spent_minutes, calendar),
            ...(withEstimate
              ? [signed(r.totals.estimate_minutes, calendar), signed(r.totals.difference_minutes, calendar)]
              : []),
            '100%',
            '',
          ],
        ])
      : null,
    withEstimate ? 'Difference is estimate − spent: negative is over the estimate.' : null,
    custom.length
      ? `Estimates read ${custom.map(s => `${s.project.key}'s ${code(s.field!)} field`).join(', ')}.`
      : null,
    r.other
      ? `Chart: ${r.other.groups} smaller groups fold into Other (${signed(r.other.spent_minutes, calendar)}).`
      : null,
  );
}

function renderGantt(r: GanttReport): string {
  const row = (b: GanttBar, withGroup: boolean) => [
    b.key,
    b.title,
    date(b.start_date),
    date(b.due_date),
    `${b.status.name}${b.resolved ? ' (resolved)' : ''}`,
    b.assignees.length ? b.assignees.map(person).join(', ') : 'Unassigned',
    b.depends_on.join(', ') || '—',
    ...(withGroup ? [b.group ?? '—'] : []),
  ];
  const headers = ['Key', 'Title', 'Start', 'Due', 'Status', 'Assignees', 'Depends on'];
  return join(
    scopeLine(`Gantt chart of ${r.project.key}`, r.scope, r.group_by === 'none' ? null : `by ${r.group_by}`),
    emptyBlock(r.empty),
    r.range ? `${r.bar_count} bars from ${date(r.range.start)} to ${date(r.range.end)}.` : null,
    ...r.groups.map(g =>
      join(
        `### ${g.label} — ${date(g.start_date)} to ${date(g.due_date)}`,
        table(
          headers,
          g.bars.map(b => row(b, false)),
        ),
      ),
    ),
    r.dependencies.length ? `Dependency arrows: ${r.dependencies.map(d => `${d.from} → ${d.to}`).join(', ')}.` : null,
    r.missing.count
      ? join(
          `### Missing dates — ${r.missing.count} ${r.missing.count === 1 ? 'issue' : 'issues'} without a start or due date`,
          table(
            [...headers, 'Group'],
            r.missing.issues.map(b => row(b, true)),
          ),
          r.missing.truncated ? `Only the first ${r.missing.issues.length} are listed.` : null,
        )
      : null,
  );
}

function renderTimesheet(r: TimesheetReport): string {
  const calendar = calendarOf(r.calendar);
  const cell = (m: number) => (m === 0 ? '' : formatDuration(m, calendar));
  const day = (d: string) => date(d).replace(/ \d{4}$/, '');
  return join(
    scopeLine('Timesheet', r.scope, null),
    emptyBlock(r.empty),
    r.rows.length
      ? table(
          ['Person', ...r.days.map(d => `${day(d.date)}${d.working_day ? '' : ' ·'}`), 'Total'],
          [
            ...r.rows.map(row => [person(row.member), ...row.minutes.map(cell), cell(row.total) || '0m']),
            ['Total', ...r.day_totals.map(cell), cell(r.total) || '0m'],
          ],
        )
      : null,
    r.rows.length ? 'Days marked · are not working days. Pass `user` for one person’s work items in the period.' : null,
  );
}

const RENDER: { [N in ReportName]: (report: never) => string } = {
  'issues-per-assignee': renderDistribution,
  'issues-per-project': renderDistribution,
  'issues-per-field': renderDistribution,
  matrix: renderMatrix,
  burndown: renderBurndown,
  'average-age': renderAge,
  time: renderTime,
  gantt: renderGantt,
  timesheet: renderTimesheet,
};

export const runReport = defineTool({
  name: 'run_report',
  title: 'Run a report',
  description:
    'Runs one of the nine reports and returns its table with the series the chart is drawn from — the same numbers as the web chart and its CSV. Every issue report is scoped by `query` (the search language) and/or a saved `view`, within the projects you can read. Issues per field and Matrix group by any groupable field, custom fields by `custom:<slug>`. Burndown reads the sprint’s daily snapshots, with scope added as its own series. Time sums logged time by work type, user, issue, project or a work item attribute, against the estimate. Timesheet is people × days; with `user` it lists that person’s work items. An empty report says which filter produced nothing.',
  input,
  kind: 'read',
  endpoints: [
    'GET /v1/reports/issues-per-assignee',
    'GET /v1/reports/issues-per-project',
    'GET /v1/reports/issues-per-field',
    'GET /v1/reports/matrix',
    'GET /v1/reports/burndown',
    'GET /v1/reports/average-age',
    'GET /v1/reports/time',
    'GET /v1/reports/gantt',
    'GET /v1/reports/timesheet',
    'GET /v1/reports/timesheet/work-items',
  ],
  async run(ctx, args) {
    checkArguments(args);
    const scope = args.org ? { org: args.org } : {};
    const query: Record<string, string | number | boolean | undefined> = {
      q: args.query,
      view: args.view,
      projects: args.projects?.map(p => p.toUpperCase()).join(','),
      project: args.project?.toUpperCase(),
      field: args.field?.toLowerCase(),
      by_category: args.by_category,
      row_field: args.row_field?.toLowerCase(),
      column_field: args.column_field?.toLowerCase(),
      include_unassigned: args.include_unassigned,
      unresolved_only: args.unresolved_only,
      group_by: args.group_by,
      sprint: args.sprint,
      measure: args.measure,
      period: args.period,
      from: args.from,
      to: args.to,
    };
    if (args.report === 'timesheet' && args.user) {
      const user = await username(ctx, args, args.user);
      const res = await ctx.api.get<TimesheetWorkItem[]>('/v1/reports/timesheet/work-items', {
        ...scope,
        query: {
          ...query,
          user,
          limit: args.limit ?? arg.DEFAULT_LIMIT,
          offset: args.offset ?? 0,
        },
      });
      const total = res.pagination?.total ?? res.data.length;
      return {
        markdown: join(
          `**Work items of ${args.user}** — ${total} ${total === 1 ? 'entry' : 'entries'}`,
          res.data.length
            ? untrusted(
                { author: user === 'me' ? 'you' : handle(user), place: 'the timesheet' },
                table(
                  ['Item', 'Issue', 'Date', 'Time', 'Work type and attributes', 'Note'],
                  res.data.map(w => [
                    `#${w.id}`,
                    `${w.issue} ${w.issue_title}`,
                    date(w.work_date),
                    formatDuration(w.duration_minutes),
                    [w.work_type?.name, ...w.attributes.map(a => `${a.attribute}: ${a.value.name}`)]
                      .filter(Boolean)
                      .join(', ') || '—',
                    w.description_md,
                  ]),
                ),
              )
            : 'No time logged in the period.',
          more(res.pagination, res.data.length),
        ),
      };
    }
    if (args.users?.length) {
      query['users'] = (await Promise.all(args.users.map(u => username(ctx, args, u)))).join(',');
    }
    const res = await ctx.api.get<{ report: ReportName }>(`/v1/reports/${args.report}`, { ...scope, query });
    return { markdown: RENDER[args.report](res.data as never) };
  },
});
