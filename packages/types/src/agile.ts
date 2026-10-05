import { z } from 'zod';
import {
  BACKLOG_MOVE_MAX_ISSUES,
  BOARD_COLUMN_FIELDS,
  BOARD_COLUMNS_MAX,
  BOARD_NAME_MAX_LENGTH,
  BOARD_SWIMLANE_FIELDS,
  BOARD_SWIMLANES,
  BOARD_WIP_MAX,
  LABEL_COLORS,
  SPRINT_NAME_MAX_LENGTH,
  STATUS_CATEGORIES,
} from './constants.ts';
import {
  IssuePriorityRefSchema,
  IssueStatusRefSchema,
  IssueTypeRefSchema,
  SprintRefSchema,
  SubtaskProgressSchema,
} from './issues.ts';
import { MemberRefSchema } from './organizations.ts';
import { TagRefSchema } from './tags.ts';

export const StatusCountSchema = z.object({
  name: z.string(),
  category: z.enum(STATUS_CATEGORIES),
  color: z.enum(LABEL_COLORS),
  count: z.number().int(),
});
export type StatusCount = z.infer<typeof StatusCountSchema>;

// Over the sprint's live issues; `mine` is those assigned to the caller.
export const SprintProgressSchema = z.object({
  issues: z.number().int(),
  resolved_issues: z.number().int(),
  points: z.number().int(),
  resolved_points: z.number().int(),
  remaining_estimate_minutes: z.number().int(),
  by_status: z.array(StatusCountSchema),
  mine: z.object({ issues: z.number().int(), resolved_issues: z.number().int() }),
});
export type SprintProgress = z.infer<typeof SprintProgressSchema>;

export const SprintSnapshotSchema = z.object({
  date: z.iso.date(),
  total_points: z.number().int(),
  completed_points: z.number().int(),
  total_issues: z.number().int(),
  completed_issues: z.number().int(),
  remaining_estimate_minutes: z.number().int(),
});
export type SprintSnapshot = z.infer<typeof SprintSnapshotSchema>;

export const SprintSchema = SprintRefSchema.extend({
  project: z.object({ key: z.string(), name: z.string() }),
  goal_md: z.string().nullable(),
  // null reads "Unscheduled".
  start_date: z.iso.date().nullable(),
  end_date: z.iso.date().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  // Active sprints only: calendar days from the caller's today to end_date, never below 0.
  days_left: z.number().int().nullable(),
  progress: SprintProgressSchema,
  // Set on the single-sprint read; null in lists.
  snapshots: z.array(SprintSnapshotSchema).nullable(),
  created_by: MemberRefSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type Sprint = z.infer<typeof SprintSchema>;

const SprintNameSchema = z.string().trim().min(1).max(SPRINT_NAME_MAX_LENGTH);
// Bounded above the 16KB product limit so the service answers with the catalogue error.
const GoalSchema = z.string().max(200_000);
const SprintNameOrSlugSchema = z.string().trim().min(1).max(SPRINT_NAME_MAX_LENGTH);
const IssueKeySchema = z.string().trim().min(1).max(40);

export const CreateSprintSchema = z.object({
  name: SprintNameSchema,
  goal_md: GoalSchema.nullable().optional(),
  start_date: z.iso.date().nullable().optional(),
  end_date: z.iso.date().nullable().optional(),
  // Another sprint whose unresolved issues move into the new one.
  add_unresolved_from: SprintNameOrSlugSchema.optional(),
});
export type CreateSprint = z.infer<typeof CreateSprintSchema>;

export const UpdateSprintSchema = z.object({
  name: SprintNameSchema.optional(),
  goal_md: GoalSchema.nullable().optional(),
  start_date: z.iso.date().nullable().optional(),
  end_date: z.iso.date().nullable().optional(),
});
export type UpdateSprint = z.infer<typeof UpdateSprintSchema>;

export const StartSprintSchema = z.object({
  start_date: z.iso.date().optional(),
  end_date: z.iso.date().optional(),
});
export type StartSprint = z.infer<typeof StartSprintSchema>;

export const BACKLOG_TARGET = 'backlog';

export const FinishSprintSchema = z.object({
  // "backlog", or the name or slug of a planned sprint.
  move_unfinished_to: SprintNameOrSlugSchema,
});
export type FinishSprint = z.infer<typeof FinishSprintSchema>;

export const SprintFinishResultSchema = z.object({
  sprint: SprintSchema,
  moved: z.array(z.string()),
  // null: the backlog.
  moved_to: SprintRefSchema.nullable(),
});
export type SprintFinishResult = z.infer<typeof SprintFinishResultSchema>;

export const BacklogMoveSchema = z
  .object({
    issues: z.array(IssueKeySchema).min(1).max(BACKLOG_MOVE_MAX_ISSUES),
    // Absent: stay in the current container. null: the backlog.
    sprint: SprintNameOrSlugSchema.nullable().optional(),
    before: IssueKeySchema.optional(),
    after: IssueKeySchema.optional(),
  })
  .refine(m => !(m.before && m.after), { message: 'before or after, not both', path: ['after'] });
export type BacklogMove = z.infer<typeof BacklogMoveSchema>;

// A status, priority or type as a board column holds it; `category` only for statuses.
export const BoardValueRefSchema = z.object({
  name: z.string(),
  color: z.enum(LABEL_COLORS),
  short_label: z.string(),
  category: z.enum(STATUS_CATEGORIES).nullable(),
});
export type BoardValueRef = z.infer<typeof BoardValueRefSchema>;

export const BoardValueCountSchema = BoardValueRefSchema.omit({ short_label: true }).extend({
  count: z.number().int(),
});
export type BoardValueCount = z.infer<typeof BoardValueCountSchema>;

export const BoardColumnSchema = z.object({
  name: z.string(),
  // Values of the board's column_field, in the project's order.
  values: z.array(BoardValueRefSchema),
  wip_min: z.number().int().nullable(),
  wip_max: z.number().int().nullable(),
  collapsed_by_default: z.boolean(),
  // A status column whose every status is done or cancelled: the "resolved" badge. Always false otherwise.
  resolved: z.boolean(),
});
export type BoardColumn = z.infer<typeof BoardColumnSchema>;

export const BoardSchema = z.object({
  name: z.string(),
  slug: z.string(),
  project: z.object({ key: z.string(), name: z.string() }),
  // What the columns map: moving a card sets this field of the issue.
  column_field: z.enum(BOARD_COLUMN_FIELDS),
  columns: z.array(BoardColumnSchema),
  // Values of column_field on no column: what "Add column" offers.
  unmapped_values: z.array(BoardValueRefSchema),
  swimlane_by: z.enum(BOARD_SWIMLANES),
  // Set when swimlane_by is values.
  swimlane_field: z.enum(BOARD_SWIMLANE_FIELDS).nullable(),
  // Set when swimlane_by is issues: the types whose issues become lanes.
  swimlane_types: z.array(z.string()),
  created_by: MemberRefSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type Board = z.infer<typeof BoardSchema>;

const BoardNameSchema = z.string().trim().min(1).max(BOARD_NAME_MAX_LENGTH);
const WipSchema = z.number().int().min(1).max(BOARD_WIP_MAX).nullable().optional();

export const BoardColumnInputSchema = z.object({
  name: BoardNameSchema,
  // Names of column_field's values.
  values: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  wip_min: WipSchema,
  wip_max: WipSchema,
  collapsed_by_default: z.boolean().optional(),
});
export type BoardColumnInput = z.infer<typeof BoardColumnInputSchema>;

const ColumnsInputSchema = z.array(BoardColumnInputSchema).min(1).max(BOARD_COLUMNS_MAX);

export const CreateBoardSchema = z.object({
  name: BoardNameSchema,
  column_field: z.enum(BOARD_COLUMN_FIELDS).optional(),
  // Absent: To do · In progress · Done by status category for a status board, one column per value otherwise.
  columns: ColumnsInputSchema.optional(),
  swimlane_by: z.enum(BOARD_SWIMLANES).optional(),
  swimlane_field: z.enum(BOARD_SWIMLANE_FIELDS).nullable().optional(),
  swimlane_types: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});
export type CreateBoard = z.infer<typeof CreateBoardSchema>;

export const UpdateBoardSchema = z.object({
  name: BoardNameSchema.optional(),
  // A new field without columns seeds one column per value of it, in the project's order.
  column_field: z.enum(BOARD_COLUMN_FIELDS).optional(),
  // The whole list, in order: columns are replaced, not patched.
  columns: ColumnsInputSchema.optional(),
  swimlane_by: z.enum(BOARD_SWIMLANES).optional(),
  swimlane_field: z.enum(BOARD_SWIMLANE_FIELDS).nullable().optional(),
  swimlane_types: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});
export type UpdateBoard = z.infer<typeof UpdateBoardSchema>;

export const BoardCardSchema = z.object({
  key: z.string(),
  title: z.string(),
  status: IssueStatusRefSchema,
  priority: IssuePriorityRefSchema,
  type: IssueTypeRefSchema,
  assignees: z.array(MemberRefSchema),
  tags: z.array(TagRefSchema),
  due_date: z.iso.date().nullable(),
  story_points: z.number().int().nullable(),
  estimate_minutes: z.number().int().nullable(),
  parent: z.string().nullable(),
  subtasks: SubtaskProgressSchema,
  resolved: z.boolean(),
});
export type BoardCard = z.infer<typeof BoardCardSchema>;

export const BoardViewColumnSchema = BoardColumnSchema.extend({
  // Cards matching the filter.
  count: z.number().int(),
  // Every card of the sprint in the column, filter or not: what the WIP limits compare with.
  total: z.number().int(),
  over_wip_max: z.boolean(),
  under_wip_min: z.boolean(),
});
export type BoardViewColumn = z.infer<typeof BoardViewColumnSchema>;

export const BOARD_LANE_KINDS = ['all', 'value', 'issue', 'uncategorized'] as const;

export const BoardLaneSchema = z.object({
  kind: z.enum(BOARD_LANE_KINDS),
  // The value's name (a username for assignees), or the lane issue's key; null for all and uncategorized.
  key: z.string().nullable(),
  label: z.string(),
  // The lane's own issue when kind is issue; it heads the lane and is not also a card.
  issue: BoardCardSchema.nullable(),
  member: MemberRefSchema.nullable(),
  count: z.number().int(),
  cells: z.array(z.object({ column: z.string(), cards: z.array(BoardCardSchema) })),
});
export type BoardLane = z.infer<typeof BoardLaneSchema>;

export const BoardViewSchema = z.object({
  board: BoardSchema,
  // null when the board was asked for the current sprint and none is active.
  sprint: SprintSchema.nullable(),
  columns: z.array(BoardViewColumnSchema),
  lanes: z.array(BoardLaneSchema),
  // The status distribution strip over the filtered cards.
  distribution: z.array(StatusCountSchema),
  // Filtered cards whose column_field value sits on no column, per value.
  unmapped: z.array(BoardValueCountSchema),
  // More than BOARD_CARDS_MAX cards matched; the lanes hold the first ones by rank.
  truncated: z.boolean(),
});
export type BoardView = z.infer<typeof BoardViewSchema>;
