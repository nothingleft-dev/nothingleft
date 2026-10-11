import { z } from 'zod';
import {
  BULK_UPDATE_MAX_ISSUES,
  ISSUE_CSV_COLUMNS,
  ISSUE_GROUP_FIELDS,
  SAVED_VIEW_NAME_MAX,
  SAVED_VIEW_VISIBILITIES,
  STATUS_CATEGORIES,
} from './constants.ts';
import { CUSTOM_FIELD_SLUG_PATTERN } from './custom-fields.ts';
import { IssueSchema, UpdateIssueSchema } from './issues.ts';
import { MemberRefSchema } from './organizations.ts';

export const QUERY_MAX_LENGTH = 2000;
export const QueryTextSchema = z.string().max(QUERY_MAX_LENGTH);

// `group` is set only when the list is grouped: the group this row is listed under.
export const IssueListItemSchema = IssueSchema.extend({ group: z.string().nullable().optional() });
export type IssueListItem = z.infer<typeof IssueListItemSchema>;

const customColumn = z
  .string()
  .refine(v => v.startsWith('custom:') && CUSTOM_FIELD_SLUG_PATTERN.test(v.slice('custom:'.length)))
  .transform(v => v as `custom:${string}`);

// `custom:<slug>` groups by a custom field.
export const IssueGroupBySchema = z.union([z.enum(ISSUE_GROUP_FIELDS), customColumn]);
export const IssueCsvColumnSchema = z.union([z.enum(ISSUE_CSV_COLUMNS), customColumn]);

export const IssueListQuerySchema = z.object({
  q: QueryTextSchema.optional(),
  project: z.string().trim().min(1).max(20).optional(),
  group_by: IssueGroupBySchema.optional(),
  // The `sort by:` value list, e.g. `priority, updated desc`; overrides any `sort by:` in q.
  sort: z.string().max(200).optional(),
});

export const SuggestionSchema = z.object({
  kind: z.enum(['attribute', 'value', 'operator', 'saved_search', 'recent_search']),
  label: z.string(),
  insert: z.string(),
  replace: z.object({ start: z.number().int(), end: z.number().int() }),
  description: z.string().nullable(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const SortKeySchema = z.object({ attribute: z.string(), direction: z.enum(['asc', 'desc']) });

export const SavedViewSchema = z.object({
  name: z.string(),
  query: z.string(),
  visibility: z.enum(SAVED_VIEW_VISIBILITIES),
  project: z.object({ key: z.string(), name: z.string() }).nullable(),
  owner: MemberRefSchema,
  sort: z.array(SortKeySchema),
  columns: z.array(z.string()),
  position: z.number().int(),
  // Whether the caller may rename, change or delete it.
  can_edit: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type SavedView = z.infer<typeof SavedViewSchema>;

const ViewNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(SAVED_VIEW_NAME_MAX)
  .refine(name => !/[{}]/.test(name));
const ColumnsSchema = z.array(z.string().trim().min(1).max(60)).max(40);

export const CreateSavedViewSchema = z.object({
  name: ViewNameSchema,
  query: QueryTextSchema,
  visibility: z.enum(SAVED_VIEW_VISIBILITIES).default('private'),
  // Required for project visibility; otherwise the view is cross-project.
  project: z.string().trim().min(1).max(20).nullable().optional(),
  sort: z.string().max(200).optional(),
  columns: ColumnsSchema.optional(),
});
export type CreateSavedView = z.infer<typeof CreateSavedViewSchema>;

export const UpdateSavedViewSchema = z.object({
  name: ViewNameSchema.optional(),
  query: QueryTextSchema.optional(),
  visibility: z.enum(SAVED_VIEW_VISIBILITIES).optional(),
  project: z.string().trim().min(1).max(20).nullable().optional(),
  sort: z.string().max(200).nullable().optional(),
  columns: ColumnsSchema.optional(),
  position: z.number().int().min(0).max(10_000).optional(),
});
export type UpdateSavedView = z.infer<typeof UpdateSavedViewSchema>;

export const BulkUpdateIssuesSchema = z.object({
  issues: z.array(z.string().trim().min(1).max(40)).min(1).max(BULK_UPDATE_MAX_ISSUES),
  changes: UpdateIssueSchema.omit({ title: true, description_md: true })
    .extend({
      add_assignees: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
      remove_assignees: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
    })
    .refine(c => Object.keys(c).length > 0),
});
export type BulkUpdateIssues = z.infer<typeof BulkUpdateIssuesSchema>;

export const BulkUpdateResultSchema = z.object({
  key: z.string(),
  result: z.enum(['updated', 'unchanged', 'failed']),
  // Present when result is failed: the same body a single PATCH would have answered with.
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
      valid_values: z.array(z.string()).optional(),
    })
    .optional(),
});
export type BulkUpdateResult = z.infer<typeof BulkUpdateResultSchema>;

export const IssueFiguresSchema = z.object({
  // null for the figures of the whole query; set with per=project.
  project: z.object({ key: z.string(), name: z.string() }).nullable(),
  open: z.number().int(),
  unassigned: z.number().int(),
  overdue: z.number().int(),
  due_today: z.number().int(),
  created_7d: z.number().int(),
  resolved_7d: z.number().int(),
  resolved_prev_7d: z.number().int(),
  by_category: z.record(z.enum(STATUS_CATEGORIES), z.number().int()),
  // Open issues per assignee, busiest first, at most 20.
  by_assignee: z.array(z.object({ member: MemberRefSchema, open: z.number().int() })),
  // The caller's own time on these issues, this week by the organisation's week start.
  logged_minutes_this_week: z.number().int(),
  last_updated_at: z.string().nullable(),
});
export type IssueFigures = z.infer<typeof IssueFiguresSchema>;

export const LANDING_KINDS = ['project', 'project_list', 'org_switcher', 'no_org', 'welcome'] as const;
export const LandingSchema = z.object({
  kind: z.enum(LANDING_KINDS),
  organization_slug: z.string().nullable(),
  project_key: z.string().nullable(),
});
export type Landing = z.infer<typeof LandingSchema>;

export const ClearedRecentSearchesSchema = z.object({ cleared: z.number().int() });
export type ClearedRecentSearches = z.infer<typeof ClearedRecentSearchesSchema>;
