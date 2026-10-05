import {
  render,
  renderClause,
  resolveDatePeriod,
  parse,
  type Bound,
  type Clause,
  type Query,
  type Value,
} from '@nothingleft/query';
import {
  CUSTOM_GROUP_PREFIX,
  REPORT_GANTT_MAX_BARS,
  REPORT_MATRIX_MAX_AXIS,
  REPORT_MAX_GROUPS,
  REPORT_SERIES_MAX,
  REPORT_TIME_MAX_DAYS,
  REPORT_TIMESHEET_MAX_DAYS,
  TIME_ATTRIBUTE_PREFIX,
  viaOf,
  type AverageAgeQuery,
  type AverageAgeReport,
  type BurndownQuery,
  type BurndownReport,
  type DistributionReport,
  type GanttBar,
  type GanttQuery,
  type GanttReport,
  type IssueGroupBy,
  type IssuesPerAssigneeQuery,
  type IssuesPerFieldQuery,
  type IssuesPerProjectQuery,
  type LabelColor,
  type MatrixQuery,
  type MatrixReport,
  type MemberRef,
  type Pagination,
  type Principal,
  type ReportEmpty,
  type ReportFilter,
  type ReportGroup,
  type ReportName,
  type ReportPalette,
  type ReportPeriodQuery,
  type ReportScope,
  type ReportScopeQuery,
  type StatusCategory,
  type TimeReport,
  type TimeReportQuery,
  type TimesheetQuery,
  type TimesheetReport,
  type TimesheetWorkItem,
  type TimesheetWorkItemsQuery,
} from '@nothingleft/types';
import {
  byDisplayOrder,
  statusCategoryOf,
  STATUS_CATEGORY_GROUP,
  type GroupSourceField,
  type IssueSearchRepository,
  type IssuesRepository,
  type OrganizationsRepository,
  type ReportGroupRow,
  type ReportsRepository,
  type SavedViewsRepository,
  type SprintRow,
  type SprintsRepository,
  type TenantContext,
  type TimeGrouping,
  type WorkItemAttributesRepository,
  type WorkPeriod,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import {
  addCalendarDays,
  calendarDaysBetween,
  formatCalendarDate,
  formatDuration,
  workingDaysBetween,
  type WorkCalendar,
  type WorkWeek,
} from '@nothingleft/format';
import { t, type MessageKey } from '@nothingleft/i18n';
import { AppError } from '@lib/errors';
import { csvLine } from '@lib/csv';
import type { AccessService } from '@services/access';
import { dailyOnce, type DailyOnceStore } from '@services/daily-once';
import type { ReportCache } from '@services/report-cache';
import type { SearchContext, SearchService } from '@services/search.service';
import type { OrgHints } from '@services/tenancy.service';

export interface ReportsDeps {
  access: AccessService;
  search: SearchService;
  reports: ReportsRepository;
  sprints: SprintsRepository;
  issues: IssuesRepository;
  issueSearch: IssueSearchRepository;
  savedViews: SavedViewsRepository;
  organizations: OrganizationsRepository;
  workItemAttributes: WorkItemAttributesRepository;
  cache: ReportCache;
  analytics: Analytics;
  redis: DailyOnceStore;
  now?: () => Date;
}

export interface ReportInputs {
  'issues-per-assignee': IssuesPerAssigneeQuery;
  'issues-per-project': IssuesPerProjectQuery;
  'issues-per-field': IssuesPerFieldQuery;
  matrix: MatrixQuery;
  burndown: BurndownQuery;
  'average-age': AverageAgeQuery;
  time: TimeReportQuery;
  gantt: GanttQuery;
  timesheet: TimesheetQuery;
}

export interface ReportOutputs {
  'issues-per-assignee': DistributionReport;
  'issues-per-project': DistributionReport;
  'issues-per-field': DistributionReport;
  matrix: MatrixReport;
  burndown: BurndownReport;
  'average-age': AverageAgeReport;
  time: TimeReport;
  gantt: GanttReport;
  timesheet: TimesheetReport;
}

type Capability = 'report.read' | 'report.export';

/** Everything a report needs to compute, and what its cached result is keyed by. */
interface Prepared<T> {
  orgId: number;
  orgSlug: string;
  parts: unknown;
  projectCount: number;
  compute: () => Promise<T>;
  filename: (report: T) => string;
}

/** A report's issues: the search context, the checked query, and how to name and widen it. */
interface Scoped {
  sc: SearchContext;
  query: Query;
  /** The user's own query, canonical. */
  userQuery: Query;
  view: string | null;
  projectKeys: string[];
}

const DAY_SECONDS = 86_400;
// A sprint planned to end years out still draws a readable axis.
const BURNDOWN_MAX_DAYS = 366;
const round1 = (n: number) => Math.round(n * 10) / 10;
const share = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0);
const literal = (value: string): Value => ({ kind: 'literal', value, negated: false });
const attributeClause = (attribute: string, values: Value[]): Clause => ({ kind: 'attribute', attribute, values });
const dateBound = (date: string): Bound => ({ kind: 'date', date });

/**
 * Series slots for the chart: the heaviest `REPORT_SERIES_MAX` items get one, numbered in the
 * items' own (natural) order so a colour follows the entity rather than its rank.
 */
export function seriesSlots(weights: readonly number[], naturalOrder: readonly number[]): (number | null)[] {
  const chosen = weights
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w - a.w || naturalOrder[a.i]! - naturalOrder[b.i]!)
    .slice(0, REPORT_SERIES_MAX)
    .filter(x => x.w > 0)
    .sort((a, b) => naturalOrder[a.i]! - naturalOrder[b.i]!);
  const slots: (number | null)[] = weights.map(() => null);
  chosen.forEach((x, n) => (slots[x.i] = n + 1));
  return slots;
}

/** Keeps the `max` heaviest items, in their original order. */
function keepHeaviest<T>(items: T[], weight: (item: T) => number, max: number): { kept: T[]; dropped: T[] } {
  if (items.length <= max) return { kept: items, dropped: [] };
  const ranked = items.map((item, i) => ({ item, i })).sort((a, b) => weight(b.item) - weight(a.item) || a.i - b.i);
  const keep = new Set(ranked.slice(0, max).map(x => x.i));
  return { kept: items.filter((_, i) => keep.has(i)), dropped: items.filter((_, i) => !keep.has(i)) };
}

const signedDuration = (minutes: number | null, calendar: WorkCalendar) =>
  minutes === null ? null : minutes < 0 ? `-${formatDuration(-minutes, calendar)}` : formatDuration(minutes, calendar);

export function reportsService(deps: ReportsDeps) {
  const { access, search, reports, sprints, issues, issueSearch, savedViews, organizations, cache, analytics } = deps;
  const now = deps.now ?? (() => new Date());

  async function scoped(
    principal: Principal,
    hints: OrgHints,
    input: ReportScopeQuery,
    capability: Capability,
    projectKeys: string[] = input.projects ?? [],
  ): Promise<Scoped> {
    const keys = [...new Set(projectKeys.map(k => k.toUpperCase()))];
    const sc = await search.context(principal, hints, keys.length > 0 ? keys : undefined);
    access.require(principal, capability, sc.org.scope);
    let view: string | null = null;
    let viewClauses: Clause[] = [];
    if (input.view) {
      const visible = await savedViews.listVisible(sc.ctx, principal.userId, sc.scope.projectIds);
      const match = visible.find(v => v.name.toLowerCase() === input.view!.toLowerCase());
      if (!match || /[{}]/.test(match.name)) {
        throw new AppError('report.unknown_view', 400, { name: input.view }, 'view', [
          ...new Set(visible.map(v => v.name)),
        ]);
      }
      view = match.name;
      viewClauses = (await search.compile(principal, sc, `#{${view}}`, undefined, { field: 'view' })).query.clauses;
    }
    const own = await search.compile(principal, sc, input.q);
    return {
      sc,
      query: { clauses: [...viewClauses, ...own.query.clauses] },
      userQuery: own.query,
      view,
      projectKeys: keys,
    };
  }

  const renderQuery = (s: Scoped, query: Query) => render(query, s.sc.registry);

  function scopeDto(s: Scoped, period: WorkPeriod | null = null): ReportScope {
    const text = renderQuery(s, s.userQuery);
    return {
      query: text || null,
      view: s.view,
      projects: s.sc.projects.map(p => ({ key: p.key, name: p.name })),
      period: period ? { from: period.from, to: period.to } : null,
    };
  }

  /** The issue-list query for a slice of a report: the report's scope plus the slice's own clauses. */
  function drill(s: Scoped, ...clauses: (Clause | null)[]): string | null {
    if (clauses.some(c => c === null)) return null;
    const parts: Clause[] = [...s.query.clauses.filter(c => c.kind !== 'sort')];
    const namesProject = clauses.some(c => c?.kind === 'attribute' && c.attribute === 'project');
    if (s.projectKeys.length > 0 && !namesProject) parts.push(attributeClause('project', s.projectKeys.map(literal)));
    parts.push(...(clauses as Clause[]));
    return renderQuery(s, { clauses: parts });
  }

  function filtersOf(s: Scoped, extra: ReportFilter[] = []): ReportFilter[] {
    const own = s.userQuery.clauses.filter(c => c.kind !== 'sort');
    const filters: ReportFilter[] = own.map(c => ({
      kind: 'clause',
      label: renderClause(c, s.sc.registry),
      widen_query: renderQuery(s, { clauses: s.userQuery.clauses.filter(other => other !== c) }),
    }));
    if (s.view) {
      filters.push({
        kind: 'view',
        label: renderClause({ kind: 'view', name: s.view, query: { clauses: [] } }, s.sc.registry),
        widen_query: renderQuery(s, s.userQuery),
      });
    }
    if (s.projectKeys.length > 0) {
      filters.push({
        kind: 'projects',
        label: t('report.filter.projects', { projects: s.projectKeys.join(', ') }),
        widen_query: null,
      });
    }
    return [...filters, ...extra];
  }

  // A clause or view is something issues match; projects and the like qualify the sentence instead.
  const describes = (filters: ReportFilter[]) => {
    const labels = (kinds: (f: ReportFilter) => boolean) =>
      filters
        .filter(kinds)
        .map(f => f.label)
        .join(', ');
    const matched = labels(f => f.kind === 'clause' || f.kind === 'view');
    const qualified = labels(f => f.kind !== 'clause' && f.kind !== 'view');
    return { matched, qualified, all: [matched, qualified].filter(Boolean).join(', ') };
  };

  function emptyIssues(filters: ReportFilter[]): ReportEmpty {
    const { matched, all } = describes(filters);
    return {
      reason: 'no_issues',
      message: matched
        ? t('report.empty.no_issues', { filters: all })
        : all
          ? t('report.empty.no_issues_qualified', { filters: all })
          : t('report.empty.no_issues_anywhere'),
      filters,
    };
  }

  const periodFilter = (period: WorkPeriod): ReportFilter => ({
    kind: 'period',
    label: t('report.filter.period', { from: formatCalendarDate(period.from), to: formatCalendarDate(period.to) }),
    widen_query: null,
  });

  function emptyTime(filters: ReportFilter[], period: WorkPeriod): ReportEmpty {
    const params = { from: formatCalendarDate(period.from), to: formatCalendarDate(period.to) };
    return {
      reason: 'no_time',
      message: (() => {
        const { matched, all } = describes(filters);
        if (matched) return t('report.empty.no_time', { ...params, filters: all });
        return all
          ? t('report.empty.no_time_qualified', { ...params, filters: all })
          : t('report.empty.no_time_anywhere', params);
      })(),
      filters: [...filters, periodFilter(period)],
    };
  }

  const calendarOf = (s: { sc: SearchContext }) => ({
    workday_minutes: s.sc.org.organization.workday_minutes,
    workweek_days: s.sc.org.organization.workweek_days,
  });
  const workWeekOf = (org: { workweek_days: number; week_starts_on: number }): WorkWeek => ({
    workweekDays: org.workweek_days,
    weekStartsOn: org.week_starts_on,
  });

  function baseParts(name: ReportName, input: unknown, principal: Principal, s: Scoped) {
    return {
      name,
      input,
      query: s.query,
      user: principal.userId,
      timezone: s.sc.scope.timezone,
      today: s.sc.scope.today,
      projects: [...s.sc.scope.projectIds].sort((a, b) => a - b),
    };
  }

  async function statusNamesByCategory(s: Scoped) {
    const rows = await reports.statuses(s.sc.ctx, s.sc.scope.projectIds);
    const byCategory = new Map<StatusCategory, string[]>();
    const setsByProject = new Map<number, Set<string>>();
    for (const r of rows) {
      const names = byCategory.get(r.category) ?? [];
      if (!names.some(n => n.toLowerCase() === r.name.toLowerCase())) names.push(r.name);
      byCategory.set(r.category, names);
      setsByProject.set(r.project_id, (setsByProject.get(r.project_id) ?? new Set()).add(r.name.toLowerCase()));
    }
    const signatures = new Set([...setsByProject.values()].map(set => [...set].sort().join('\u0000')));
    return { byCategory, differ: signatures.size > 1 };
  }

  function labelOf(s: Scoped, field: GroupSourceField, row: ReportGroupRow): string {
    if (field === STATUS_CATEGORY_GROUP) return t(`report.category.${row.key}` as MessageKey);
    return search.groupLabel(s.sc, field, {
      key: row.key,
      value: row.value,
      label: row.label,
      color: row.color,
      category: null,
      count: row.count,
    });
  }

  function clauseFor(
    s: Scoped,
    field: GroupSourceField,
    row: ReportGroupRow,
    categories: Map<StatusCategory, string[]> | null,
  ): Clause | null {
    const empty: Value = { kind: 'empty', negated: false };
    if (field === STATUS_CATEGORY_GROUP) {
      const names = categories?.get(row.key as StatusCategory) ?? [];
      return names.length ? attributeClause('status', names.map(literal)) : null;
    }
    if (field.startsWith(CUSTOM_GROUP_PREFIX)) {
      const slug = field.slice(CUSTOM_GROUP_PREFIX.length);
      const custom = s.sc.catalogue.fields.find(f => f.slug === slug);
      if (custom?.type === 'checkbox') return attributeClause(slug, [literal(row.key === '' ? 'No' : 'Yes')]);
      return attributeClause(slug, [row.key === '' ? empty : literal(row.value ?? '')]);
    }
    switch (field) {
      case 'project':
      case 'status':
      case 'priority':
      case 'type':
        return row.value ? attributeClause(field, [literal(row.value)]) : null;
      case 'assignee':
      case 'sprint':
        return attributeClause(field, [row.key === '' ? empty : literal(row.value ?? '')]);
      case 'tag':
        return row.key === ''
          ? attributeClause('has', [{ kind: 'attribute', attribute: 'tag', negated: true }])
          : attributeClause('tag', [literal(row.value ?? '')]);
      case 'due': {
        const { today } = s.sc.scope;
        const week = resolveDatePeriod({ kind: 'keyword', keyword: 'this week' }, s.sc.scope)!;
        const range = (from: string | null, to: string | null): Value => ({
          kind: 'range',
          from: from ? dateBound(from) : null,
          to: to ? dateBound(to) : null,
          negated: false,
        });
        const bucket: Record<string, Value> = {
          '': empty,
          overdue: range(null, addCalendarDays(today, -1)),
          today: { ...dateBound(today), negated: false } as Value,
          this_week: range(addCalendarDays(today, 1), week.end),
          later: range(addCalendarDays(week.end, 1), null),
        };
        const value = bucket[row.key];
        return value ? attributeClause('due date', [value]) : null;
      }
      default:
        return null;
    }
  }

  const paletteOf = (field: GroupSourceField): ReportPalette =>
    field === 'status' ? 'label' : field === STATUS_CATEGORY_GROUP ? 'category' : 'series';

  function groupDtos(
    s: Scoped,
    field: GroupSourceField,
    rows: ReportGroupRow[],
    total: number,
    categories: Map<StatusCategory, string[]> | null,
    withSeries = true,
  ): ReportGroup[] {
    const slots = withSeries
      ? seriesSlots(
          rows.map(r => r.count),
          rows.map((_, i) => i),
        )
      : rows.map(() => null);
    return rows.map((row, i) => ({
      value: row.value,
      label: labelOf(s, field, row),
      color: (row.color as LabelColor | null) ?? null,
      category:
        field === 'status'
          ? statusCategoryOf(row.o)
          : field === STATUS_CATEGORY_GROUP && row.key !== ''
            ? (row.key as StatusCategory)
            : null,
      series: slots[i] ?? null,
      count: row.count,
      share: share(row.count, total),
      query: drill(s, clauseFor(s, field, row, categories)),
      other: false,
    }));
  }

  const otherGroup = (count: number, total: number): ReportGroup => ({
    value: null,
    label: t('report.group.other'),
    color: null,
    category: null,
    series: null,
    count,
    share: share(count, total),
    query: null,
    other: true,
  });

  function fieldSource(s: Scoped, field: IssueGroupBy, byCategory = false): GroupSourceField {
    search.checkGroupBy(s.sc, field);
    return byCategory ? STATUS_CATEGORY_GROUP : field;
  }

  function resolvePeriod(s: Scoped, input: ReportPeriodQuery, maxDays: number): WorkPeriod {
    let period: WorkPeriod;
    if (input.period !== undefined) {
      const text = input.period.trim();
      const braced = /\s/.test(text) && !text.includes('..') && !text.startsWith('{') ? `{${text}}` : text;
      const invalid = () => new AppError('report.invalid_period', 400, { period: text }, 'period');
      const parsed = (() => {
        try {
          return parse(`created: ${braced}`, s.sc.registry).query.clauses[0];
        } catch {
          throw invalid();
        }
      })();
      const value = parsed?.kind === 'attribute' && parsed.values.length === 1 ? parsed.values[0]! : null;
      const context = { today: s.sc.scope.today, weekStartsOn: s.sc.scope.weekStartsOn };
      const whole = (b: Bound | null) =>
        b && b.kind !== 'number' && b.kind !== 'duration' ? resolveDatePeriod(b, context) : null;
      if (!value || value.negated) throw invalid();
      if (value.kind === 'range') {
        const from = whole(value.from);
        const to = whole(value.to);
        if (!from || !to) throw invalid();
        period = { from: from.start, to: to.end };
      } else {
        const one = whole(value as Bound);
        if (!one) throw invalid();
        period = { from: one.start, to: one.end };
      }
    } else if (input.from !== undefined || input.to !== undefined) {
      if (input.from === undefined || input.to === undefined) {
        throw new AppError('report.period_incomplete', 400, {}, input.from === undefined ? 'from' : 'to');
      }
      period = { from: input.from, to: input.to };
    } else {
      const week = resolveDatePeriod({ kind: 'keyword', keyword: 'this week' }, s.sc.scope)!;
      period = { from: week.start, to: week.end };
    }
    if (period.from > period.to) {
      throw new AppError(
        'report.period_out_of_order',
        400,
        { from: formatCalendarDate(period.from), to: formatCalendarDate(period.to) },
        input.period !== undefined ? 'period' : 'to',
      );
    }
    const days = calendarDaysBetween(period.from, period.to);
    if (days > maxDays) {
      throw new AppError('report.period_too_long', 400, { days, max: maxDays }, input.period ? 'period' : 'to');
    }
    return period;
  }

  async function memberRefs(ctx: TenantContext, userIds: number[]): Promise<Map<number, MemberRef>> {
    const people = await issues.findPeople(ctx, userIds);
    return new Map(people.map(p => [p.user.id, access.memberRef(p.user, p.membership)]));
  }

  async function resolveUsers(
    principal: Principal,
    s: Scoped,
    names: readonly string[],
    field: string,
  ): Promise<{ id: number; username: string }[]> {
    const wanted = names.map(n => n.replace(/^@/, ''));
    const others = wanted.filter(n => n.toLowerCase() !== 'me');
    const found = await organizations.findMembersByUsernames(s.sc.ctx, others, { includeRemoved: true });
    const out: { id: number; username: string }[] = [];
    for (const name of wanted) {
      if (name.toLowerCase() === 'me') {
        out.push({ id: principal.userId, username: s.sc.org.membership.username });
        continue;
      }
      const member = found.find(f => f.membership.username.toLowerCase() === name.toLowerCase());
      if (!member) {
        const vocabulary = await issueSearch.vocabulary(s.sc.ctx, s.sc.scope.projectIds, new Set(['user']));
        throw new AppError(
          'report.unknown_user',
          400,
          { username: name },
          field,
          vocabulary.usernames.filter(u => !u.removed).map(u => u.username),
        );
      }
      out.push({ id: member.user.id, username: member.membership.username });
    }
    return out.filter((u, i) => out.findIndex(o => o.id === u.id) === i);
  }

  async function distribution(
    principal: Principal,
    hints: OrgHints,
    name: 'issues-per-assignee' | 'issues-per-project' | 'issues-per-field',
    input: ReportScopeQuery & { field?: IssueGroupBy; by_category?: boolean; include_unassigned?: boolean },
    capability: Capability,
  ): Promise<Prepared<DistributionReport>> {
    const s = await scoped(principal, hints, input, capability);
    const field: IssueGroupBy =
      name === 'issues-per-assignee' ? 'assignee' : name === 'issues-per-project' ? 'project' : input.field!;
    if (input.by_category && field !== 'status') {
      throw new AppError('report.by_category_status_only', 400, {}, 'by_category');
    }
    const source = fieldSource(s, field, input.by_category ?? false);
    return {
      orgId: s.sc.org.organization.id,
      orgSlug: s.sc.org.organization.slug,
      parts: baseParts(name, input, principal, s),
      projectCount: s.sc.projects.length,
      filename: () => `${s.sc.org.organization.slug}-${name}-${s.sc.scope.today}.csv`,
      compute: async () => {
        const [result, statuses] = await Promise.all([
          reports.distribution(s.sc.ctx, s.sc.scope, s.query, source),
          field === 'status' ? statusNamesByCategory(s) : null,
        ]);
        let rows = byDisplayOrder(result.groups);
        let total = result.total;
        const extra: ReportFilter[] = [];
        if (name === 'issues-per-assignee' && input.include_unassigned === false) {
          total -= rows.find(r => r.key === '')?.count ?? 0;
          rows = rows.filter(r => r.key !== '');
          extra.push({ kind: 'include_unassigned', label: t('issue.group.unassigned'), widen_query: null });
        }
        const { kept, dropped } = keepHeaviest(rows, r => r.count, REPORT_MAX_GROUPS);
        const counted = rows.reduce((sum, r) => sum + r.count, 0);
        const groups = groupDtos(s, source, kept, counted, statuses?.byCategory ?? null);
        const folded = groups.filter(g => g.series === null);
        const foldedCount = folded.reduce((sum, g) => sum + g.count, 0) + dropped.reduce((sum, r) => sum + r.count, 0);
        return {
          report: name,
          scope: scopeDto(s),
          empty: total === 0 ? emptyIssues(filtersOf(s)) : null,
          generated_at: now().toISOString(),
          field: input.by_category ? STATUS_CATEGORY_GROUP : field,
          palette: paletteOf(source),
          groups,
          other:
            folded.length + dropped.length > 0 ? { count: foldedCount, groups: folded.length + dropped.length } : null,
          total_issues: total,
          total_counted: counted,
          multi_valued_issues: result.multi_valued,
          by_category: input.by_category ?? false,
          by_category_available: statuses?.differ ?? false,
          truncated: dropped.length > 0,
        };
      },
    };
  }

  async function matrix(
    principal: Principal,
    hints: OrgHints,
    input: MatrixQuery,
    capability: Capability,
  ): Promise<Prepared<MatrixReport>> {
    const s = await scoped(principal, hints, input, capability);
    const rowField = fieldSource(s, input.row_field);
    const columnField = fieldSource(s, input.column_field);
    return {
      orgId: s.sc.org.organization.id,
      orgSlug: s.sc.org.organization.slug,
      parts: baseParts('matrix', input, principal, s),
      projectCount: s.sc.projects.length,
      filename: () => `${s.sc.org.organization.slug}-matrix-${s.sc.scope.today}.csv`,
      compute: async () => {
        const needsStatuses = rowField === 'status' || columnField === 'status';
        const [rowsResult, columnsResult, cells, statuses] = await Promise.all([
          reports.distribution(s.sc.ctx, s.sc.scope, s.query, rowField),
          reports.distribution(s.sc.ctx, s.sc.scope, s.query, columnField),
          reports.matrix(s.sc.ctx, s.sc.scope, s.query, rowField, columnField),
          needsStatuses ? statusNamesByCategory(s) : null,
        ]);
        const total = rowsResult.total;
        const axis = (field: GroupSourceField, rows: ReportGroupRow[], series: boolean) => {
          const ordered = byDisplayOrder(rows);
          const { kept, dropped } = keepHeaviest(ordered, r => r.count, REPORT_MATRIX_MAX_AXIS);
          const groups = groupDtos(s, field, kept, total, statuses?.byCategory ?? null, series);
          const index = new Map(kept.map((r, i) => [r.key, i]));
          if (dropped.length > 0) {
            groups.push(
              otherGroup(
                dropped.reduce((sum, r) => sum + r.count, 0),
                total,
              ),
            );
            for (const r of dropped) index.set(r.key, groups.length - 1);
          }
          return { axis: { field, palette: paletteOf(field), groups, truncated: dropped.length > 0 }, index };
        };
        const rowAxis = axis(rowField, rowsResult.groups, false);
        const columnAxis = axis(columnField, columnsResult.groups, true);
        const merged = new Map<string, { row: number; column: number; count: number }>();
        for (const cell of cells) {
          const row = rowAxis.index.get(cell.row_key);
          const column = columnAxis.index.get(cell.column_key);
          if (row === undefined || column === undefined) continue;
          const key = `${row}:${column}`;
          const entry = merged.get(key) ?? { row, column, count: 0 };
          entry.count += cell.count;
          merged.set(key, entry);
        }
        const rowRows = byDisplayOrder(rowsResult.groups);
        const columnRows = byDisplayOrder(columnsResult.groups);
        const cellDtos = [...merged.values()]
          .sort((a, b) => a.row - b.row || a.column - b.column)
          .map(c => {
            const rowGroup = rowAxis.axis.groups[c.row]!;
            const columnGroup = columnAxis.axis.groups[c.column]!;
            const rowSource = rowGroup.other ? null : rowRows.find(r => rowAxis.index.get(r.key) === c.row);
            const columnSource = columnGroup.other
              ? null
              : columnRows.find(r => columnAxis.index.get(r.key) === c.column);
            const rowClause = rowSource ? clauseFor(s, rowField, rowSource, statuses?.byCategory ?? null) : null;
            const columnClause = columnSource
              ? clauseFor(s, columnField, columnSource, statuses?.byCategory ?? null)
              : null;
            const query = drill(s, rowClause, columnClause);
            return { row: c.row, column: c.column, count: c.count, query };
          });
        return {
          report: 'matrix' as const,
          scope: scopeDto(s),
          empty: total === 0 ? emptyIssues(filtersOf(s)) : null,
          generated_at: now().toISOString(),
          rows: rowAxis.axis,
          columns: columnAxis.axis,
          cells: cellDtos,
          max_cell: cellDtos.reduce((max, c) => Math.max(max, c.count), 0),
          total_issues: total,
          multi_valued: rowsResult.multi_valued + columnsResult.multi_valued > 0,
        };
      },
    };
  }

  async function averageAge(
    principal: Principal,
    hints: OrgHints,
    input: AverageAgeQuery,
    capability: Capability,
  ): Promise<Prepared<AverageAgeReport>> {
    const s = await scoped(principal, hints, input, capability);
    const field = input.group_by === 'none' ? null : fieldSource(s, input.group_by);
    return {
      orgId: s.sc.org.organization.id,
      orgSlug: s.sc.org.organization.slug,
      parts: { ...baseParts('average-age', input, principal, s), now: Math.floor(s.sc.scope.now.getTime() / 60_000) },
      projectCount: s.sc.projects.length,
      filename: () => `${s.sc.org.organization.slug}-average-age-${s.sc.scope.today}.csv`,
      compute: async () => {
        const [grouped, overall, statuses] = await Promise.all([
          field ? reports.age(s.sc.ctx, s.sc.scope, s.query, field, input.unresolved_only) : Promise.resolve([]),
          reports.age(s.sc.ctx, s.sc.scope, s.query, null, input.unresolved_only),
          field === 'status' ? statusNamesByCategory(s) : null,
        ]);
        const all = overall[0];
        const count = all?.count ?? 0;
        const ordered = byDisplayOrder(grouped);
        const { kept, dropped } = keepHeaviest(ordered, r => r.count, REPORT_MAX_GROUPS);
        const keys = await reports.issueKeys(
          s.sc.ctx,
          [...kept, ...(all ? [all] : [])].flatMap(r => (r.oldest_issue_id === null ? [] : [r.oldest_issue_id])),
        );
        const dtos = field ? groupDtos(s, field, kept, count, statuses?.byCategory ?? null) : [];
        const days = (seconds: number) => round1(seconds / DAY_SECONDS);
        const extra: ReportFilter[] = input.unresolved_only
          ? [{ kind: 'unresolved_only', label: t('report.filter.unresolved_only'), widen_query: null }]
          : [];
        return {
          report: 'average-age' as const,
          scope: scopeDto(s),
          empty: count === 0 ? emptyIssues(filtersOf(s, extra)) : null,
          generated_at: now().toISOString(),
          group_by: field,
          palette: field ? paletteOf(field) : 'series',
          unresolved_only: input.unresolved_only,
          groups: dtos.map((g, i) => ({
            ...g,
            average_days: days(kept[i]!.average_seconds),
            oldest_days: days(kept[i]!.oldest_seconds),
            oldest: kept[i]!.oldest_issue_id === null ? null : (keys.get(kept[i]!.oldest_issue_id!) ?? null),
          })),
          overall: {
            count,
            average_days: days(all?.average_seconds ?? 0),
            oldest_days: days(all?.oldest_seconds ?? 0),
            oldest: all?.oldest_issue_id ? (keys.get(all.oldest_issue_id) ?? null) : null,
          },
          truncated: dropped.length > 0,
        };
      },
    };
  }

  async function timeGrouping(s: Scoped, groupBy: string): Promise<TimeGrouping> {
    if (!groupBy.startsWith(TIME_ATTRIBUTE_PREFIX))
      return { kind: groupBy as 'user' | 'work_type' | 'issue' | 'project' };
    const name = groupBy.slice(TIME_ATTRIBUTE_PREFIX.length).trim();
    const attributes = await deps.workItemAttributes.listForProjects(s.sc.ctx, s.sc.scope.projectIds);
    const match = attributes.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      throw new AppError('report.unknown_attribute', 400, { name }, 'group_by', [
        ...new Set(attributes.map(a => `${TIME_ATTRIBUTE_PREFIX}${a.name}`)),
      ]);
    }
    return { kind: 'attribute', name: match.name };
  }

  async function time(
    principal: Principal,
    hints: OrgHints,
    input: TimeReportQuery,
    capability: Capability,
  ): Promise<Prepared<TimeReport>> {
    const s = await scoped(principal, hints, input, capability);
    const period = resolvePeriod(s, input, REPORT_TIME_MAX_DAYS);
    const grouping = await timeGrouping(s, input.group_by);
    return {
      orgId: s.sc.org.organization.id,
      orgSlug: s.sc.org.organization.slug,
      parts: { ...baseParts('time', input, principal, s), period },
      projectCount: s.sc.projects.length,
      filename: () => `${s.sc.org.organization.slug}-time-${period.from}-${period.to}.csv`,
      compute: async () => {
        const rows = await reports.time(s.sc.ctx, s.sc.scope, s.query, period, grouping);
        const total = rows.reduce((sum, r) => sum + r.spent_minutes, 0);
        const bySpent = [...rows].sort(
          (a, b) => b.spent_minutes - a.spent_minutes || (a.label ?? '').localeCompare(b.label ?? ''),
        );
        const { kept, dropped } = keepHeaviest(bySpent, r => r.spent_minutes, REPORT_MAX_GROUPS);
        const natural = byDisplayOrder([...kept]).map(r => kept.indexOf(r));
        const naturalRank = kept.map((_, i) => natural.indexOf(i));
        const slots = seriesSlots(
          kept.map(r => r.spent_minutes),
          naturalRank,
        );
        const perIssue = grouping.kind === 'issue' || grouping.kind === 'project';
        const label = (r: (typeof rows)[number]) => {
          if (r.key !== '') return r.label ?? r.value ?? '';
          return grouping.kind === 'attribute'
            ? t('report.time.no_attribute', { name: grouping.name })
            : t('report.time.no_work_type');
        };
        const clause = (r: (typeof rows)[number]): Clause | null => {
          if (r.key === '' || r.value === null) return null;
          switch (grouping.kind) {
            case 'user':
              return attributeClause('work author', [literal(r.value)]);
            case 'work_type':
              return attributeClause('work type', [literal(r.value)]);
            case 'issue':
              return attributeClause('key', [{ kind: 'key', key: r.value, negated: false }]);
            case 'project':
              return attributeClause('project', [literal(r.value)]);
            case 'attribute':
              return null;
          }
        };
        const estimateTotal = perIssue ? rows.reduce((sum, r) => sum + (r.estimate_minutes ?? 0), 0) : null;
        const folded = slots.filter(slot => slot === null).length + dropped.length;
        const roles = s.sc.catalogue.roles;
        return {
          report: 'time' as const,
          scope: scopeDto(s, period),
          empty: total === 0 ? emptyTime(filtersOf(s), period) : null,
          generated_at: now().toISOString(),
          group_by: grouping.kind === 'attribute' ? `${TIME_ATTRIBUTE_PREFIX}${grouping.name}` : grouping.kind,
          rows: kept.map((r, i) => ({
            value: r.value,
            label: label(r),
            series: slots[i] ?? null,
            spent_minutes: r.spent_minutes,
            estimate_minutes: perIssue ? r.estimate_minutes : null,
            difference_minutes: perIssue ? (r.estimate_minutes ?? 0) - r.spent_minutes : null,
            share: share(r.spent_minutes, total),
            query: drill(s, clause(r)),
          })),
          other:
            folded > 0
              ? {
                  spent_minutes:
                    kept.filter((_, i) => slots[i] === null).reduce((sum, r) => sum + r.spent_minutes, 0) +
                    dropped.reduce((sum, r) => sum + r.spent_minutes, 0),
                  groups: folded,
                }
              : null,
          totals: {
            spent_minutes: total,
            estimate_minutes: estimateTotal,
            difference_minutes: estimateTotal === null ? null : estimateTotal - total,
          },
          estimate_sources: s.sc.projects.map(p => {
            const fieldId = roles.get(p.id)?.estimation ?? null;
            const field = fieldId === null ? undefined : s.sc.catalogue.fields.find(f => f.id === fieldId);
            return { project: { key: p.key, name: p.name }, field: field?.name ?? null };
          }),
          calendar: calendarOf(s),
          truncated: dropped.length > 0,
        };
      },
    };
  }

  function daysOf(period: WorkPeriod, week: WorkWeek) {
    const working = new Set(workingDaysBetween(period.from, period.to, week));
    const days: { date: string; working_day: boolean }[] = [];
    for (let d = period.from; d <= period.to; d = addCalendarDays(d, 1))
      days.push({ date: d, working_day: working.has(d) });
    return days;
  }

  async function timesheet(
    principal: Principal,
    hints: OrgHints,
    input: TimesheetQuery,
    capability: Capability,
  ): Promise<Prepared<TimesheetReport>> {
    const s = await scoped(principal, hints, input, capability);
    const period = resolvePeriod(s, input, REPORT_TIMESHEET_MAX_DAYS);
    const users = input.users?.length ? await resolveUsers(principal, s, input.users, 'users') : null;
    return {
      orgId: s.sc.org.organization.id,
      orgSlug: s.sc.org.organization.slug,
      parts: { ...baseParts('timesheet', input, principal, s), period, users: users?.map(u => u.id) ?? null },
      projectCount: s.sc.projects.length,
      filename: () => `${s.sc.org.organization.slug}-timesheet-${period.from}-${period.to}.csv`,
      compute: async () => {
        const cells = await reports.timesheet(s.sc.ctx, s.sc.scope, s.query, period, users?.map(u => u.id) ?? null);
        const days = daysOf(period, workWeekOf(s.sc.org.organization));
        const dayIndex = new Map(days.map((d, i) => [d.date, i]));
        const authorIds = users ? users.map(u => u.id) : [...new Set(cells.map(c => c.author_id))];
        const people = await memberRefs(s.sc.ctx, authorIds);
        const rows = authorIds
          .map(id => {
            const minutes = days.map(() => 0);
            for (const c of cells) if (c.author_id === id) minutes[dayIndex.get(c.work_date)!]! += c.minutes;
            return {
              member: people.get(id) ?? {
                username: '',
                name: '',
                avatar_url: null,
                former_member: true,
                deactivated: false,
              },
              minutes,
              total: minutes.reduce((a, b) => a + b, 0),
            };
          })
          .sort(
            (a, b) => a.member.name.localeCompare(b.member.name) || a.member.username.localeCompare(b.member.username),
          );
        const dayTotals = days.map((_, i) => rows.reduce((sum, r) => sum + r.minutes[i]!, 0));
        const total = dayTotals.reduce((a, b) => a + b, 0);
        const extra: ReportFilter[] = users
          ? [
              {
                kind: 'users',
                label: t('report.filter.users', { users: users.map(u => u.username).join(', ') }),
                widen_query: null,
              },
            ]
          : [];
        return {
          report: 'timesheet' as const,
          scope: scopeDto(s, period),
          empty: total === 0 ? emptyTime(filtersOf(s, extra), period) : null,
          generated_at: now().toISOString(),
          days,
          rows,
          day_totals: dayTotals,
          total,
          calendar: calendarOf(s),
        };
      },
    };
  }

  async function gantt(
    principal: Principal,
    hints: OrgHints,
    input: GanttQuery,
    capability: Capability,
  ): Promise<Prepared<GanttReport>> {
    const s = await scoped(principal, hints, input, capability, [input.project]);
    const project = s.sc.projects[0]!;
    return {
      orgId: s.sc.org.organization.id,
      orgSlug: s.sc.org.organization.slug,
      parts: baseParts('gantt', input, principal, s),
      projectCount: 1,
      filename: () => `${s.sc.org.organization.slug}-gantt-${project.key.toLowerCase()}-${s.sc.scope.today}.csv`,
      compute: async () => {
        const result = await reports.gantt(s.sc.ctx, s.sc.scope, s.query, input.group_by, REPORT_GANTT_MAX_BARS);
        const all = [...result.bars, ...result.missing];
        const people = await memberRefs(s.sc.ctx, [...new Set(all.flatMap(r => r.assignee_ids))]);
        const keyOf = new Map(all.map(r => [r.id, r.key]));
        const dependsOn = new Map<number, string[]>();
        for (const link of result.links) {
          dependsOn.set(link.to_id, [...(dependsOn.get(link.to_id) ?? []), keyOf.get(link.from_id)!]);
        }
        const emptyLabel =
          input.group_by === 'epic'
            ? t('report.gantt.no_epic')
            : input.group_by === 'assignee'
              ? t('issue.group.unassigned')
              : t('report.gantt.all');
        const bar = (r: (typeof all)[number], withGroup: boolean): GanttBar => ({
          key: r.key,
          title: r.title,
          status: { name: r.status_name, category: r.status_category, color: r.status_color as LabelColor },
          assignees: r.assignee_ids.map(
            id =>
              people.get(id) ?? { username: '', name: '', avatar_url: null, former_member: true, deactivated: false },
          ),
          start_date: r.start_date,
          due_date: r.due_date,
          resolved: r.status_category === 'done' || r.status_category === 'cancelled',
          depends_on: dependsOn.get(r.id) ?? [],
          group: withGroup ? (input.group_by === 'none' ? null : (r.group_label ?? emptyLabel)) : null,
        });
        const groups = new Map<string, GanttReport['groups'][number]>();
        for (const r of result.bars) {
          const key = r.group_key ?? '';
          const label =
            key === ''
              ? emptyLabel
              : input.group_by === 'epic'
                ? `${r.group_value} ${r.group_label}`
                : (r.group_label ?? '');
          const group = groups.get(key) ?? {
            value: key === '' ? null : r.group_value,
            label,
            query:
              input.group_by === 'assignee'
                ? drill(
                    s,
                    attributeClause('assignee', [
                      key === '' ? { kind: 'empty', negated: false } : literal(r.group_value ?? ''),
                    ]),
                  )
                : input.group_by === 'none'
                  ? drill(s)
                  : null,
            start_date: null,
            due_date: null,
            bars: [],
          };
          group.bars.push(bar(r, false));
          if (!group.start_date || r.start_date! < group.start_date) group.start_date = r.start_date;
          if (!group.due_date || r.due_date! > group.due_date) group.due_date = r.due_date;
          groups.set(key, group);
        }
        const ordered = [...groups.entries()]
          .sort(
            ([ka, a], [kb, b]) =>
              Number(ka === '') - Number(kb === '') ||
              (a.start_date ?? '').localeCompare(b.start_date ?? '') ||
              a.label.localeCompare(b.label),
          )
          .map(([, g]) => g);
        const drawn = new Set(result.bars.map(r => r.id));
        const starts = result.bars.map(r => r.start_date!);
        const ends = result.bars.map(r => r.due_date!);
        const noIssues = result.bar_count + result.missing_count === 0;
        return {
          report: 'gantt' as const,
          scope: scopeDto(s),
          empty: noIssues
            ? emptyIssues(filtersOf(s))
            : result.bar_count === 0
              ? {
                  reason: 'no_dates' as const,
                  message: t('report.empty.no_dates', { count: result.missing_count }),
                  filters: filtersOf(s),
                }
              : null,
          generated_at: now().toISOString(),
          project: { key: project.key, name: project.name },
          group_by: input.group_by,
          range:
            starts.length > 0
              ? { start: starts.reduce((a, b) => (a < b ? a : b)), end: ends.reduce((a, b) => (a > b ? a : b)) }
              : null,
          groups: ordered,
          dependencies: result.links
            .filter(l => drawn.has(l.from_id) && drawn.has(l.to_id))
            .map(l => ({ from: keyOf.get(l.from_id)!, to: keyOf.get(l.to_id)! })),
          bar_count: result.bar_count,
          missing: {
            count: result.missing_count,
            issues: result.missing.map(r => bar(r, true)),
            truncated: result.missing_count > result.missing.length,
          },
          truncated: result.bar_count > result.bars.length,
        };
      },
    };
  }

  const utcDate = (at: Date) => at.toISOString().slice(0, 10);

  async function findSprint(
    ctx: TenantContext,
    projectId: number,
    projectKey: string,
    name?: string,
  ): Promise<SprintRow> {
    const sprint = name ? await sprints.find(ctx, projectId, name) : await sprints.findActive(ctx, projectId);
    if (sprint) return sprint;
    const names = (await sprints.list(ctx, [projectId])).map(sp => sp.name);
    throw name
      ? new AppError('report.unknown_sprint', 400, { sprint: name, project: projectKey }, 'sprint', names)
      : new AppError('report.no_active_sprint', 400, { project: projectKey }, 'sprint', names);
  }

  async function burndown(
    principal: Principal,
    hints: OrgHints,
    input: BurndownQuery,
    capability: Capability,
  ): Promise<Prepared<BurndownReport>> {
    const project = await access.project(principal, input.project, hints);
    access.require(principal, 'issue.read', project.scope);
    access.require(principal, capability, project.scope);
    const sprint = await findSprint(project.ctx, project.project.id, project.project.key, input.sprint);
    const at = now();
    const today = utcDate(at);
    const org = project.organization;
    return {
      orgId: org.id,
      orgSlug: org.slug,
      parts: { name: 'burndown', input, user: principal.userId, sprint: sprint.id, today },
      projectCount: 1,
      filename: () => `${org.slug}-burndown-${project.project.key.toLowerCase()}-${sprint.slug}.csv`,
      compute: async () => {
        const [stored, live] = await Promise.all([
          sprints.snapshots(project.ctx, sprint.id),
          sprint.state === 'active' ? sprints.liveFigures(project.ctx, sprint.id) : null,
        ]);
        const byDate = new Map(
          stored.map(r => [
            r.snapshot_date,
            {
              total_points: r.total_points,
              completed_points: r.completed_points,
              total_issues: r.total_issues,
              completed_issues: r.completed_issues,
              remaining_estimate_minutes: r.remaining_estimate_minutes,
              total_estimate_minutes: r.total_estimate_minutes,
              live: false,
            },
          ]),
        );
        if (live) byDate.set(today, { ...live, live: true });
        // Starting a sprint may name an earlier day; start_date holds it, started_at only the click.
        const start = sprint.start_date ?? (sprint.started_at ? utcDate(sprint.started_at) : null);
        const end = sprint.completed_at ? utcDate(sprint.completed_at) : sprint.end_date;
        const dates = [...byDate.keys()].sort();
        const first = start ?? dates[0] ?? null;
        const latest = [end, dates.at(-1), sprint.state === 'active' ? today : null]
          .filter((d): d is string => d !== null && d !== undefined)
          .sort()
          .at(-1);
        const last = first && latest ? [latest, addCalendarDays(first, BURNDOWN_MAX_DAYS - 1)].sort()[0] : latest;
        const week = workWeekOf(org);
        const measure = input.measure;
        type Figures = NonNullable<ReturnType<typeof byDate.get>>;
        const remainingOf = (f: Figures) =>
          measure === 'story_points'
            ? f.total_points - f.completed_points
            : measure === 'issue_count'
              ? f.total_issues - f.completed_issues
              : f.remaining_estimate_minutes;
        const scopeOf = (f: Figures) =>
          measure === 'story_points'
            ? f.total_points
            : measure === 'issue_count'
              ? f.total_issues
              : f.total_estimate_minutes;
        const completedOf = (f: Figures) => {
          if (measure === 'story_points') return f.completed_points;
          if (measure === 'issue_count') return f.completed_issues;
          return f.total_estimate_minutes === null ? null : f.total_estimate_minutes - f.remaining_estimate_minutes;
        };
        const days: BurndownReport['days'] = [];
        // The first stored snapshot is the baseline even when today's live figures replace it on the chart.
        const baselineRow = first ? stored.find(r => r.snapshot_date >= first) : undefined;
        const firstFigures = baselineRow
          ? { ...baselineRow, live: false }
          : (byDate.get(dates.find(d => !first || d >= first) ?? '') ?? null);
        if (first && last) {
          const startRemaining = firstFigures ? remainingOf(firstFigures) : null;
          const startScope = firstFigures ? scopeOf(firstFigures) : null;
          const planned = end ? workingDaysBetween(addCalendarDays(first, 1), end, week).length : 0;
          const working = new Set(workingDaysBetween(first, last, week));
          let elapsed = 0;
          for (let d = first; d <= last; d = addCalendarDays(d, 1)) {
            if (d > first && working.has(d)) elapsed += 1;
            const f = byDate.get(d) ?? null;
            const scope = f ? scopeOf(f) : null;
            let ideal: number | null = null;
            if (startRemaining !== null && end) {
              ideal =
                d >= end
                  ? 0
                  : planned === 0
                    ? startRemaining
                    : round1(startRemaining * Math.max(0, 1 - elapsed / planned));
            }
            days.push({
              date: d,
              working_day: working.has(d),
              remaining: f ? remainingOf(f) : null,
              ideal,
              scope,
              scope_added: scope !== null && startScope !== null ? scope - startScope : null,
              completed: f ? completedOf(f) : null,
              live: f?.live ?? false,
            });
          }
        }
        const withData = days.filter(d => d.remaining !== null);
        const lastDay = withData.at(-1) ?? null;
        const noFigures = withData.length === 0;
        return {
          report: 'burndown' as const,
          scope: {
            query: null,
            view: null,
            projects: [{ key: project.project.key, name: project.project.name }],
            period: first && last ? { from: first, to: last } : null,
          },
          empty: noFigures
            ? {
                reason: 'no_snapshots' as const,
                message: t('report.empty.no_snapshots', { sprint: sprint.name }),
                filters: [],
              }
            : null,
          generated_at: at.toISOString(),
          sprint: {
            project: { key: project.project.key, name: project.project.name },
            name: sprint.name,
            slug: sprint.slug,
            state: sprint.state as 'planned' | 'active' | 'completed',
            start_date: sprint.start_date,
            end_date: sprint.end_date,
            started_at: sprint.started_at?.toISOString() ?? null,
            completed_at: sprint.completed_at?.toISOString() ?? null,
          },
          measure,
          unit: measure === 'story_points' ? 'points' : measure === 'issue_count' ? 'issues' : 'minutes',
          days,
          summary: {
            start_scope: firstFigures ? scopeOf(firstFigures) : null,
            scope: lastDay?.scope ?? null,
            scope_added: lastDay?.scope_added ?? null,
            completed: lastDay?.completed ?? null,
            remaining: lastDay?.remaining ?? null,
          },
          calendar: { workday_minutes: org.workday_minutes, workweek_days: org.workweek_days },
        };
      },
    };
  }

  function prepare<N extends ReportName>(
    principal: Principal,
    name: N,
    input: ReportInputs[N],
    hints: OrgHints,
    capability: Capability,
  ): Promise<Prepared<ReportOutputs[N]>> {
    const run = (): Promise<unknown> => {
      switch (name) {
        case 'issues-per-assignee':
        case 'issues-per-project':
        case 'issues-per-field':
          return distribution(principal, hints, name, input as IssuesPerFieldQuery, capability);
        case 'matrix':
          return matrix(principal, hints, input as MatrixQuery, capability);
        case 'burndown':
          return burndown(principal, hints, input as BurndownQuery, capability);
        case 'average-age':
          return averageAge(principal, hints, input as AverageAgeQuery, capability);
        case 'time':
          return time(principal, hints, input as TimeReportQuery, capability);
        case 'gantt':
          return gantt(principal, hints, input as GanttQuery, capability);
        case 'timesheet':
          return timesheet(principal, hints, input as TimesheetQuery, capability);
      }
      throw new Error(`unknown report ${String(name)}`);
    };
    return run() as Promise<Prepared<ReportOutputs[N]>>;
  }

  async function produce<N extends ReportName>(
    principal: Principal,
    name: N,
    input: ReportInputs[N],
    hints: OrgHints,
    capability: Capability,
  ) {
    const prepared = await prepare(principal, name, input, hints, capability);
    const { value, cached } = await cache.remember(prepared.orgId, prepared.parts, prepared.compute);
    return { prepared, report: value, cached };
  }

  const groupCount = (report: ReportOutputs[ReportName]): number => {
    switch (report.report) {
      case 'matrix':
        return report.cells.length;
      case 'burndown':
        return report.days.length;
      case 'time':
        return report.rows.length;
      case 'gantt':
        return report.bar_count;
      case 'timesheet':
        return report.rows.length;
      default:
        return report.groups.length;
    }
  };

  return {
    async report<N extends ReportName>(
      principal: Principal,
      name: N,
      input: ReportInputs[N],
      hints: OrgHints = {},
    ): Promise<ReportOutputs[N]> {
      const { prepared, report, cached } = await produce(principal, name, input, hints, 'report.read');
      if (await dailyOnce(deps.redis, `report:${name}:${prepared.orgId}:${principal.userId}`, now())) {
        analytics.capture(
          'report_viewed',
          {
            report: name,
            via: viaOf(principal),
            empty: report.empty !== null,
            cached,
            group_count: groupCount(report),
            project_count: prepared.projectCount,
          },
          { userId: principal.userId, orgId: prepared.orgId },
        );
      }
      return report;
    },

    async exportCsv<N extends ReportName>(
      principal: Principal,
      name: N,
      input: ReportInputs[N],
      hints: OrgHints = {},
    ): Promise<{ filename: string; rows: AsyncIterable<string> }> {
      const { prepared, report } = await produce(principal, name, input, hints, 'report.export');
      analytics.capture(
        'report_exported',
        { report: name, via: viaOf(principal) },
        { userId: principal.userId, orgId: prepared.orgId },
      );
      const lines = csvLines(report);
      async function* rows(): AsyncIterable<string> {
        for (const line of lines) yield line;
      }
      return { filename: prepared.filename(report), rows: rows() };
    },

    /** The work items behind one timesheet cell (or row): one author, the period, the same scope. */
    async timesheetWorkItems(
      principal: Principal,
      input: TimesheetWorkItemsQuery & { limit: number; offset: number },
      hints: OrgHints = {},
    ): Promise<{ data: TimesheetWorkItem[]; pagination: Pagination }> {
      const s = await scoped(principal, hints, input, 'report.read');
      const period = resolvePeriod(s, input, REPORT_TIMESHEET_MAX_DAYS);
      const [user] = await resolveUsers(principal, s, [input.user], 'user');
      const page = await reports.timesheetEntries(s.sc.ctx, s.sc.scope, s.query, period, user!.id, {
        limit: input.limit,
        offset: input.offset,
      });
      const people = await memberRefs(s.sc.ctx, [user!.id]);
      const author = people.get(user!.id) ?? {
        username: user!.username,
        name: '',
        avatar_url: null,
        former_member: true,
        deactivated: false,
      };
      return {
        data: page.rows.map(r => ({
          id: r.id,
          issue: `${r.project_key}-${r.key_number}`,
          issue_title: r.title,
          project: r.project_key,
          author,
          work_date: r.work_date,
          duration_minutes: r.duration_minutes,
          work_type: r.work_type,
          attributes: r.attributes.map(a => ({
            attribute: a.attribute,
            value: { name: a.name, short_label: a.short_label },
          })),
          description_md: r.description_md,
        })),
        pagination: {
          total: page.total,
          limit: input.limit,
          offset: input.offset,
          next_cursor: null,
          has_more: input.offset + page.rows.length < page.total,
        },
      };
    },
  };
}

/** The CSV of a report: the same figures as its JSON, as rows a spreadsheet can sum. */
export function csvLines(report: ReportOutputs[ReportName]): string[] {
  const total = t('report.csv.total');
  switch (report.report) {
    case 'issues-per-assignee':
    case 'issues-per-project':
    case 'issues-per-field':
      return [
        csvLine(['label', 'value', 'issues', 'share']),
        ...report.groups.map(g => csvLine([g.label, g.value, g.count, g.share])),
        csvLine([total, null, report.total_issues, null]),
      ];
    case 'matrix': {
      const counts = new Map(report.cells.map(c => [`${c.row}:${c.column}`, c.count]));
      const rowTotal = (r: number) =>
        report.columns.groups.reduce((sum, _, c) => sum + (counts.get(`${r}:${c}`) ?? 0), 0);
      return [
        csvLine([report.rows.field, ...report.columns.groups.map(g => g.label), 'total']),
        ...report.rows.groups.map((g, r) =>
          csvLine([g.label, ...report.columns.groups.map((_, c) => counts.get(`${r}:${c}`) ?? 0), rowTotal(r)]),
        ),
        csvLine([total, ...report.columns.groups.map(g => g.count), report.total_issues]),
      ];
    }
    case 'burndown':
      return [
        csvLine(['date', 'remaining', 'ideal', 'scope', 'scope_added', 'completed', 'live']),
        ...report.days.map(d => csvLine([d.date, d.remaining, d.ideal, d.scope, d.scope_added, d.completed, d.live])),
      ];
    case 'average-age':
      return [
        csvLine(['group', 'value', 'issues', 'average_age_days', 'oldest_days', 'oldest']),
        ...report.groups.map(g => csvLine([g.label, g.value, g.count, g.average_days, g.oldest_days, g.oldest])),
        csvLine([
          total,
          null,
          report.overall.count,
          report.overall.average_days,
          report.overall.oldest_days,
          report.overall.oldest,
        ]),
      ];
    case 'time': {
      const calendar = { workdayMinutes: report.calendar.workday_minutes, workweekDays: report.calendar.workweek_days };
      const d = (m: number | null) => signedDuration(m, calendar);
      return [
        csvLine([
          'group',
          'value',
          'spent',
          'spent_minutes',
          'estimate',
          'estimate_minutes',
          'difference',
          'difference_minutes',
          'share',
        ]),
        ...report.rows.map(r =>
          csvLine([
            r.label,
            r.value,
            d(r.spent_minutes),
            r.spent_minutes,
            d(r.estimate_minutes),
            r.estimate_minutes,
            d(r.difference_minutes),
            r.difference_minutes,
            r.share,
          ]),
        ),
        csvLine([
          total,
          null,
          d(report.totals.spent_minutes),
          report.totals.spent_minutes,
          d(report.totals.estimate_minutes),
          report.totals.estimate_minutes,
          d(report.totals.difference_minutes),
          report.totals.difference_minutes,
          null,
        ]),
      ];
    }
    case 'gantt': {
      const line = (b: GanttBar, group: string | null, scheduled: boolean) =>
        csvLine([
          b.key,
          b.title,
          group,
          b.start_date,
          b.due_date,
          b.status.name,
          b.assignees.map(a => a.username).join(', '),
          b.depends_on.join(', '),
          scheduled,
        ]);
      return [
        csvLine(['key', 'title', 'group', 'start_date', 'due_date', 'status', 'assignees', 'depends_on', 'scheduled']),
        ...report.groups.flatMap(g => g.bars.map(b => line(b, report.group_by === 'none' ? null : g.label, true))),
        ...report.missing.issues.map(b => line(b, b.group, false)),
      ];
    }
    case 'timesheet': {
      const calendar = { workdayMinutes: report.calendar.workday_minutes, workweekDays: report.calendar.workweek_days };
      const d = (m: number) => (m === 0 ? null : formatDuration(m, calendar));
      return [
        csvLine(['user', 'username', ...report.days.map(day => day.date), 'total', 'total_minutes']),
        ...report.rows.map(r => csvLine([r.member.name, r.member.username, ...r.minutes.map(d), d(r.total), r.total])),
        csvLine([total, null, ...report.day_totals.map(d), d(report.total), report.total]),
      ];
    }
  }
}

export type ReportsService = ReturnType<typeof reportsService>;
