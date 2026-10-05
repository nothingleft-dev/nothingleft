import { z } from 'zod';
import { AttachmentIdsSchema } from './attachments.ts';
import {
  ISSUE_ACTIVITY_KINDS,
  ISSUE_LINK_MAX_TARGETS,
  ISSUE_LINK_NAMES,
  ISSUE_LINK_NAME_VALUES,
  ISSUE_TITLE_MAX_LENGTH,
  LABEL_COLORS,
  SPRINT_STATES,
  STATUS_CATEGORIES,
  STORY_POINTS_MAX,
  WATCHER_SOURCES,
} from './constants.ts';
import { ActivityActorSchema } from './activity.ts';
import { CommentSchema } from './comments.ts';
import { CustomFieldsInputSchema, IssueCustomFieldValueSchema } from './custom-fields.ts';
import { MemberRefSchema } from './organizations.ts';
import { TagInputsSchema, TagRefSchema } from './tags.ts';

export const IssueStatusRefSchema = z.object({
  name: z.string(),
  category: z.enum(STATUS_CATEGORIES),
  color: z.enum(LABEL_COLORS),
  short_label: z.string(),
});
export type IssueStatusRef = z.infer<typeof IssueStatusRefSchema>;
export const IssuePriorityRefSchema = z.object({
  name: z.string(),
  color: z.enum(LABEL_COLORS),
  short_label: z.string(),
});
export const IssueTypeRefSchema = IssuePriorityRefSchema.extend({ icon: z.string().nullable() });

export const SprintRefSchema = z.object({
  name: z.string(),
  slug: z.string(),
  state: z.enum(SPRINT_STATES),
});
export type SprintRef = z.infer<typeof SprintRefSchema>;

// Live direct subtasks: the `1/3` on a board card.
export const SubtaskProgressSchema = z.object({ resolved: z.number().int(), total: z.number().int() });
export type SubtaskProgress = z.infer<typeof SubtaskProgressSchema>;

export const IssueSchema = z.object({
  key: z.string(),
  project: z.object({ key: z.string(), name: z.string() }),
  title: z.string(),
  description_md: z.string().nullable(),
  status: IssueStatusRefSchema,
  priority: IssuePriorityRefSchema,
  type: IssueTypeRefSchema,
  assignees: z.array(MemberRefSchema),
  created_by: MemberRefSchema,
  updated_by: MemberRefSchema,
  parent: z.string().nullable(),
  tags: z.array(TagRefSchema),
  estimate_minutes: z.number().int().nullable(),
  spent_minutes: z.number().int(),
  story_points: z.number().int().nullable(),
  // Summed over the live descendants; null when none has points.
  story_points_rollup: z.number().int().nullable(),
  sprint: SprintRefSchema.nullable(),
  subtasks: SubtaskProgressSchema,
  start_date: z.iso.date().nullable(),
  due_date: z.iso.date().nullable(),
  resolved_at: z.string().nullable(),
  vote_count: z.number().int(),
  comment_count: z.number().int(),
  // Ready files on the issue, its comments and its work items; drafts and pending uploads excluded.
  attachment_count: z.number().int(),
  watcher_count: z.number().int(),
  custom_fields: z.array(IssueCustomFieldValueSchema),
  // The caller's own personal signals.
  me: z.object({ starred: z.boolean(), voted: z.boolean(), watching: z.boolean() }),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  // Set only on a deleted issue: after this instant issues.purge removes it for good.
  restorable_until: z.string().nullable(),
});
export type Issue = z.infer<typeof IssueSchema>;

// A linked or referenced issue: enough for a key chip, struck through when resolved.
export const IssueRefSchema = z.object({
  key: z.string(),
  title: z.string(),
  resolved: z.boolean(),
  status: IssueStatusRefSchema,
  type: IssueTypeRefSchema,
  starred: z.boolean(),
});
export type IssueRef = z.infer<typeof IssueRefSchema>;

const TitleSchema = z.string().trim().min(1).max(ISSUE_TITLE_MAX_LENGTH);
// Bounded far above the 256KB product limit so the service, not the parser, answers with the catalogue error.
const DescriptionSchema = z.string().max(1_000_000);
const ValueNameSchema = z.string().trim().min(1).max(100);
const UsernameSchema = z.string().trim().min(1).max(40);
const IssueKeySchema = z.string().trim().min(1).max(40);
// Integer minutes, or a duration string such as `1d 4h` read with the organisation's calendar.
const EstimateSchema = z.union([z.number().int().min(0).max(10_000_000), z.string().trim().min(1).max(40)]);
const StoryPointsSchema = z.number().int().min(0).max(STORY_POINTS_MAX);
// A sprint's name or slug; null is the backlog.
const SprintInputSchema = z.string().trim().min(1).max(100);

export const CreateIssueSchema = z.object({
  project: z.string().trim().min(1).max(20),
  title: TitleSchema,
  description_md: DescriptionSchema.optional(),
  status: ValueNameSchema.optional(),
  priority: ValueNameSchema.optional(),
  type: ValueNameSchema.optional(),
  assignees: z.array(UsernameSchema).max(50).optional(),
  estimate: EstimateSchema.nullable().optional(),
  story_points: StoryPointsSchema.nullable().optional(),
  sprint: SprintInputSchema.nullable().optional(),
  start_date: z.iso.date().nullable().optional(),
  due_date: z.iso.date().nullable().optional(),
  parent: IssueKeySchema.nullable().optional(),
  tags: TagInputsSchema.optional(),
  links: z
    .array(
      z.object({
        link: z.string().trim().min(1).max(40),
        issues: z.array(IssueKeySchema).min(1).max(ISSUE_LINK_MAX_TARGETS),
      }),
    )
    .max(ISSUE_LINK_NAMES.length)
    .optional(),
  attachment_ids: AttachmentIdsSchema.optional(),
  custom_fields: CustomFieldsInputSchema.optional(),
});
export type CreateIssue = z.infer<typeof CreateIssueSchema>;

// Absent leaves a field alone; null clears it — docs/api-conventions.md#patch-distinguishes-unchanged-from-cleared.
export const UpdateIssueSchema = z.object({
  title: TitleSchema.optional(),
  description_md: DescriptionSchema.nullable().optional(),
  status: ValueNameSchema.optional(),
  priority: ValueNameSchema.optional(),
  type: ValueNameSchema.optional(),
  assignees: z.array(UsernameSchema).max(50).optional(),
  estimate: EstimateSchema.nullable().optional(),
  story_points: StoryPointsSchema.nullable().optional(),
  sprint: SprintInputSchema.nullable().optional(),
  start_date: z.iso.date().nullable().optional(),
  due_date: z.iso.date().nullable().optional(),
  parent: IssueKeySchema.nullable().optional(),
  custom_fields: CustomFieldsInputSchema.optional(),
});
export type UpdateIssue = z.infer<typeof UpdateIssueSchema>;

export const IssueActivitySchema = z.object({
  id: z.number().int(),
  kind: z.enum(ISSUE_ACTIVITY_KINDS),
  actor: ActivityActorSchema,
  change_group_id: z.string(),
  field: z.string().nullable(),
  old_value: z.unknown().nullable(),
  new_value: z.unknown().nullable(),
  // Everyone the snapshots name by username (assignees, a work item's author), former members included.
  people: z.array(MemberRefSchema),
  // First touch; the order never reshuffles.
  created_at: z.string(),
  // Last touch; what a reader sees as the entry's time.
  updated_at: z.string(),
  // The comment a commented or comment_edited entry is about; those entries vanish with it.
  comment: CommentSchema.nullable(),
});
export type IssueActivity = z.infer<typeof IssueActivitySchema>;

// One side of a `linked` / `unlinked` entry; `issue` is null when the reader cannot open that issue's project.
export const IssueLinkSnapshotSchema = z.object({
  link: z.enum(ISSUE_LINK_NAME_VALUES),
  issue: z.string().nullable(),
});
export type IssueLinkSnapshot = z.infer<typeof IssueLinkSnapshotSchema>;

export const IssueWatcherSchema = MemberRefSchema.extend({ source: z.enum(WATCHER_SOURCES) });
export type IssueWatcher = z.infer<typeof IssueWatcherSchema>;

export const AddIssueWatcherSchema = z.object({ username: UsernameSchema });
export type AddIssueWatcher = z.infer<typeof AddIssueWatcherSchema>;
