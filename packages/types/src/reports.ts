import { z } from 'zod';
import {
  LABEL_COLORS,
  REPORT_MAX_PROJECTS,
  REPORT_MAX_USERS,
  REPORT_NAMES,
  SAVED_VIEW_NAME_MAX,
  STATUS_CATEGORIES,
} from './constants.ts';
import { WorkItemAttributeRefSchema } from './custom-fields.ts';
import { MemberRefSchema } from './organizations.ts';
import { IssueGroupBySchema, QueryTextSchema } from './search.ts';

export const ReportNameSchema = z.enum(REPORT_NAMES);

const commaList = <T extends z.ZodType<unknown, string>>(item: T, max: number) =>
  z
    .string()
    .max(4000)
    .transform(v =>
      v
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).max(max));

const queryBoolean = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .default(fallback);

const ProjectKeySchema = z.string().trim().min(1).max(20);
const UsernameSchema = z.string().trim().min(1).max(41);

// Which issues a report covers: the query, a saved view by name, and the projects it is narrowed to.
export const ReportScopeQuerySchema = z.object({
  q: QueryTextSchema.optional(),
  view: z.string().trim().min(1).max(SAVED_VIEW_NAME_MAX).optional(),
  projects: commaList(ProjectKeySchema, REPORT_MAX_PROJECTS).optional(),
});

// A period of work dates: `from` and `to`, or `period` in the query language's date words
// (`Last week`, `2026-09`, `2026-09-01 .. 2026-09-14`). Neither is This week.
export const ReportPeriodQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  period: z.string().trim().min(1).max(100).optional(),
});

// `custom:<slug>` for a select, multi-select, user, multi-user or checkbox field.
export const ReportFieldSchema = IssueGroupBySchema;

export const IssuesPerAssigneeQuerySchema = ReportScopeQuerySchema.extend({
  include_unassigned: queryBoolean(true),
});
export const IssuesPerProjectQuerySchema = ReportScopeQuerySchema;
export const IssuesPerFieldQuerySchema = ReportScopeQuerySchema.extend({
  field: ReportFieldSchema,
  // Status only: the five categories instead of the statuses, so projects with renamed statuses add up.
  by_category: queryBoolean(false),
});
export const MatrixQuerySchema = ReportScopeQuerySchema.extend({
  row_field: ReportFieldSchema,
  column_field: ReportFieldSchema,
});
export const BURNDOWN_MEASURES = ['story_points', 'issue_count', 'remaining_estimate'] as const;
export type BurndownMeasure = (typeof BURNDOWN_MEASURES)[number];
export const BurndownQuerySchema = z.object({
  project: ProjectKeySchema,
  // A sprint's name or slug; absent is the project's active sprint.
  sprint: z.string().trim().min(1).max(200).optional(),
  measure: z.enum(BURNDOWN_MEASURES).default('story_points'),
});
export const AverageAgeQuerySchema = ReportScopeQuerySchema.extend({
  group_by: z.union([z.literal('none'), ReportFieldSchema]).default('none'),
  unresolved_only: queryBoolean(true),
});
export const TIME_GROUPS = ['work_type', 'user', 'issue', 'project'] as const;
export const TIME_ATTRIBUTE_PREFIX = 'attribute:';
export const TimeGroupBySchema = z.union([
  z.enum(TIME_GROUPS),
  z
    .string()
    .trim()
    .refine(v => v.startsWith(TIME_ATTRIBUTE_PREFIX) && v.length > TIME_ATTRIBUTE_PREFIX.length && v.length <= 110),
]);
export const TimeReportQuerySchema = ReportScopeQuerySchema.merge(ReportPeriodQuerySchema).extend({
  group_by: TimeGroupBySchema.default('work_type'),
});
export const GANTT_GROUPS = ['epic', 'assignee', 'none'] as const;
export const GanttQuerySchema = z.object({
  project: ProjectKeySchema,
  q: QueryTextSchema.optional(),
  view: ReportScopeQuerySchema.shape.view,
  group_by: z.enum(GANTT_GROUPS).default('none'),
});
export const TimesheetQuerySchema = ReportScopeQuerySchema.merge(ReportPeriodQuerySchema).extend({
  // Absent: everyone with time in the period.
  users: commaList(UsernameSchema, REPORT_MAX_USERS).optional(),
});
export const TimesheetWorkItemsQuerySchema = ReportScopeQuerySchema.merge(ReportPeriodQuerySchema).extend({
  user: UsernameSchema,
});

export const ReportProjectRefSchema = z.object({ key: z.string(), name: z.string() });

export const ReportScopeSchema = z.object({
  // The query as written, canonicalised; `#{views}` stay named.
  query: z.string().nullable(),
  view: z.string().nullable(),
  projects: z.array(ReportProjectRefSchema),
  period: z.object({ from: z.iso.date(), to: z.iso.date() }).nullable(),
});
export type ReportScope = z.infer<typeof ReportScopeSchema>;

// One filter that shaped a report, and the report's query without it, so an empty report can offer to widen.
export const ReportFilterSchema = z.object({
  kind: z.enum(['clause', 'view', 'projects', 'period', 'users', 'unresolved_only', 'include_unassigned']),
  label: z.string(),
  // The scope query without this filter; null when the filter is a parameter rather than a clause.
  widen_query: z.string().nullable(),
});
export type ReportFilter = z.infer<typeof ReportFilterSchema>;

export const ReportEmptySchema = z.object({
  reason: z.enum(['no_issues', 'no_time', 'no_snapshots', 'no_dates']),
  // Shown verbatim; names the filter, never a request parameter.
  message: z.string(),
  filters: z.array(ReportFilterSchema),
});
export type ReportEmpty = z.infer<typeof ReportEmptySchema>;

// What colours a chart: series slots (`--chart-N`), the entities' own label colours (status), or status categories.
export const ReportPaletteSchema = z.enum(['series', 'label', 'category']);
export type ReportPalette = z.infer<typeof ReportPaletteSchema>;

export const ReportGroupSchema = z.object({
  // The name to search by (username, key, option); null for the empty group and Other.
  value: z.string().nullable(),
  label: z.string(),
  color: z.enum(LABEL_COLORS).nullable(),
  category: z.enum(STATUS_CATEGORIES).nullable(),
  // 1–8 is the chart series (`--chart-N`); null is folded into Other.
  series: z.number().int().min(1).max(8).nullable(),
  count: z.number().int(),
  // Of the counted total, in percent to one decimal.
  share: z.number(),
  // The issue-list query for this group's issues; null for Other.
  query: z.string().nullable(),
  // The synthetic group that holds what did not fit.
  other: z.boolean(),
});
export type ReportGroup = z.infer<typeof ReportGroupSchema>;

const FoldedSchema = z.object({ count: z.number().int(), groups: z.number().int() }).nullable();

const ReportBaseSchema = z.object({
  scope: ReportScopeSchema,
  empty: ReportEmptySchema.nullable(),
  generated_at: z.string(),
});

export const DistributionReportSchema = ReportBaseSchema.extend({
  report: z.enum(['issues-per-assignee', 'issues-per-project', 'issues-per-field']),
  field: z.string(),
  palette: ReportPaletteSchema,
  groups: z.array(ReportGroupSchema),
  // What the chart folds into its Other slice beyond eight series.
  other: FoldedSchema,
  // Distinct issues; with a multi-valued field the groups add up to `total_counted` instead.
  total_issues: z.number().int(),
  total_counted: z.number().int(),
  multi_valued_issues: z.number().int(),
  by_category: z.boolean(),
  // True when grouping by status spans projects whose status names differ.
  by_category_available: z.boolean(),
  truncated: z.boolean(),
});
export type DistributionReport = z.infer<typeof DistributionReportSchema>;

export const MatrixAxisSchema = z.object({
  field: z.string(),
  palette: ReportPaletteSchema,
  // Counts are distinct issues per value; beyond the limit the rest merge into one `other` group.
  groups: z.array(ReportGroupSchema),
  truncated: z.boolean(),
});
export const MatrixCellSchema = z.object({
  row: z.number().int(),
  column: z.number().int(),
  count: z.number().int(),
  query: z.string().nullable(),
});
export const MatrixReportSchema = ReportBaseSchema.extend({
  report: z.literal('matrix'),
  rows: MatrixAxisSchema,
  columns: MatrixAxisSchema,
  // Non-zero cells only; `row` and `column` index the axes' groups.
  cells: z.array(MatrixCellSchema),
  max_cell: z.number().int(),
  total_issues: z.number().int(),
  multi_valued: z.boolean(),
});
export type MatrixReport = z.infer<typeof MatrixReportSchema>;

export const ReportCalendarSchema = z.object({ workday_minutes: z.number().int(), workweek_days: z.number().int() });

export const BurndownDaySchema = z.object({
  date: z.iso.date(),
  working_day: z.boolean(),
  // Null where no figure exists: a day not yet reached, or one the snapshot job missed.
  remaining: z.number().nullable(),
  ideal: z.number().nullable(),
  scope: z.number().nullable(),
  scope_added: z.number().nullable(),
  completed: z.number().nullable(),
  // Today's figures read live rather than from a snapshot.
  live: z.boolean(),
});
export const BurndownReportSchema = ReportBaseSchema.extend({
  report: z.literal('burndown'),
  sprint: z.object({
    project: ReportProjectRefSchema,
    name: z.string(),
    slug: z.string(),
    state: z.enum(['planned', 'active', 'completed']),
    start_date: z.iso.date().nullable(),
    end_date: z.iso.date().nullable(),
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
  }),
  measure: z.enum(BURNDOWN_MEASURES),
  unit: z.enum(['points', 'issues', 'minutes']),
  days: z.array(BurndownDaySchema),
  summary: z.object({
    start_scope: z.number().nullable(),
    scope: z.number().nullable(),
    scope_added: z.number().nullable(),
    completed: z.number().nullable(),
    remaining: z.number().nullable(),
  }),
  calendar: ReportCalendarSchema,
});
export type BurndownReport = z.infer<typeof BurndownReportSchema>;

export const AgeGroupSchema = ReportGroupSchema.extend({
  average_days: z.number(),
  oldest_days: z.number(),
  oldest: z.string().nullable(),
});
export const AverageAgeReportSchema = ReportBaseSchema.extend({
  report: z.literal('average-age'),
  group_by: z.string().nullable(),
  palette: ReportPaletteSchema,
  unresolved_only: z.boolean(),
  groups: z.array(AgeGroupSchema),
  overall: z.object({
    count: z.number().int(),
    average_days: z.number(),
    oldest_days: z.number(),
    oldest: z.string().nullable(),
  }),
  truncated: z.boolean(),
});
export type AverageAgeReport = z.infer<typeof AverageAgeReportSchema>;

export const TimeRowSchema = z.object({
  value: z.string().nullable(),
  label: z.string(),
  series: z.number().int().min(1).max(8).nullable(),
  spent_minutes: z.number().int(),
  // Grouped by issue or project only: an issue's estimate cannot be split between people or work types.
  estimate_minutes: z.number().int().nullable(),
  // estimate − spent: negative is over the estimate.
  difference_minutes: z.number().int().nullable(),
  share: z.number(),
  query: z.string().nullable(),
});
export const TimeReportSchema = ReportBaseSchema.extend({
  report: z.literal('time'),
  group_by: z.string(),
  rows: z.array(TimeRowSchema),
  other: z.object({ spent_minutes: z.number().int(), groups: z.number().int() }).nullable(),
  totals: z.object({
    spent_minutes: z.number().int(),
    estimate_minutes: z.number().int().nullable(),
    difference_minutes: z.number().int().nullable(),
  }),
  // Where each project's estimate comes from: the built-in Estimation or its chosen duration field.
  estimate_sources: z.array(z.object({ project: ReportProjectRefSchema, field: z.string().nullable() })),
  calendar: ReportCalendarSchema,
  truncated: z.boolean(),
});
export type TimeReport = z.infer<typeof TimeReportSchema>;

export const GanttBarSchema = z.object({
  key: z.string(),
  title: z.string(),
  status: z.object({ name: z.string(), category: z.enum(STATUS_CATEGORIES), color: z.enum(LABEL_COLORS) }),
  assignees: z.array(MemberRefSchema),
  start_date: z.iso.date().nullable(),
  due_date: z.iso.date().nullable(),
  resolved: z.boolean(),
  // Keys of the readable issues this one depends on.
  depends_on: z.array(z.string()),
  // The group label, on the missing-dates list only.
  group: z.string().nullable(),
});
export type GanttBar = z.infer<typeof GanttBarSchema>;
export const GanttGroupSchema = z.object({
  value: z.string().nullable(),
  label: z.string(),
  query: z.string().nullable(),
  start_date: z.iso.date().nullable(),
  due_date: z.iso.date().nullable(),
  bars: z.array(GanttBarSchema),
});
export const GanttReportSchema = ReportBaseSchema.extend({
  report: z.literal('gantt'),
  project: ReportProjectRefSchema,
  group_by: z.enum(GANTT_GROUPS),
  range: z.object({ start: z.iso.date(), end: z.iso.date() }).nullable(),
  groups: z.array(GanttGroupSchema),
  // `from` is the prerequisite: `to` depends on it. Only between drawn bars.
  dependencies: z.array(z.object({ from: z.string(), to: z.string() })),
  bar_count: z.number().int(),
  // Issues without a start date or a due date, listed rather than dropped.
  missing: z.object({ count: z.number().int(), issues: z.array(GanttBarSchema), truncated: z.boolean() }),
  truncated: z.boolean(),
});
export type GanttReport = z.infer<typeof GanttReportSchema>;

export const TimesheetReportSchema = ReportBaseSchema.extend({
  report: z.literal('timesheet'),
  days: z.array(z.object({ date: z.iso.date(), working_day: z.boolean() })),
  // One row per author; `minutes` lines up with `days`.
  rows: z.array(z.object({ member: MemberRefSchema, minutes: z.array(z.number().int()), total: z.number().int() })),
  day_totals: z.array(z.number().int()),
  total: z.number().int(),
  calendar: ReportCalendarSchema,
});
export type TimesheetReport = z.infer<typeof TimesheetReportSchema>;

export const TimesheetWorkItemSchema = z.object({
  id: z.number().int(),
  issue: z.string(),
  issue_title: z.string(),
  project: z.string(),
  author: MemberRefSchema,
  work_date: z.iso.date(),
  duration_minutes: z.number().int(),
  work_type: z.object({ name: z.string(), short_label: z.string() }).nullable(),
  attributes: z.array(WorkItemAttributeRefSchema),
  description_md: z.string(),
});
export type TimesheetWorkItem = z.infer<typeof TimesheetWorkItemSchema>;

export type IssuesPerAssigneeQuery = z.output<typeof IssuesPerAssigneeQuerySchema>;
export type IssuesPerProjectQuery = z.output<typeof IssuesPerProjectQuerySchema>;
export type IssuesPerFieldQuery = z.output<typeof IssuesPerFieldQuerySchema>;
export type MatrixQuery = z.output<typeof MatrixQuerySchema>;
export type BurndownQuery = z.output<typeof BurndownQuerySchema>;
export type AverageAgeQuery = z.output<typeof AverageAgeQuerySchema>;
export type TimeReportQuery = z.output<typeof TimeReportQuerySchema>;
export type GanttQuery = z.output<typeof GanttQuerySchema>;
export type TimesheetQuery = z.output<typeof TimesheetQuerySchema>;
export type TimesheetWorkItemsQuery = z.output<typeof TimesheetWorkItemsQuerySchema>;
export type ReportScopeQuery = z.output<typeof ReportScopeQuerySchema>;
export type ReportPeriodQuery = z.output<typeof ReportPeriodQuerySchema>;
