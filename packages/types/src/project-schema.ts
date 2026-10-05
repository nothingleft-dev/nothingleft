import { z } from 'zod';
import {
  CONFIG_NAME_MAX_LENGTH,
  LABEL_COLORS,
  STATUS_CATEGORIES,
  type LabelColor,
  type StatusCategory,
} from './constants.ts';

export const PROJECT_SCHEMA_TABLES = ['statuses', 'priorities', 'types', 'work_types'] as const;
export type ProjectSchemaTable = (typeof PROJECT_SCHEMA_TABLES)[number];

export const WorkflowStatusSchema = z.object({
  name: z.string(),
  category: z.enum(STATUS_CATEGORIES),
  color: z.enum(LABEL_COLORS),
  short_label: z.string(),
  position: z.number().int(),
  is_default: z.boolean(),
  is_archived: z.boolean(),
});
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const PrioritySchema = z.object({
  name: z.string(),
  color: z.enum(LABEL_COLORS),
  short_label: z.string(),
  position: z.number().int(),
  is_default: z.boolean(),
});
export type Priority = z.infer<typeof PrioritySchema>;

export const IssueTypeSchema = z.object({
  name: z.string(),
  icon: z.string().nullable(),
  color: z.enum(LABEL_COLORS),
  short_label: z.string(),
  position: z.number().int(),
  is_default: z.boolean(),
});
export type IssueType = z.infer<typeof IssueTypeSchema>;

export const WorkTypeSchema = z.object({
  name: z.string(),
  short_label: z.string(),
  position: z.number().int(),
  is_default: z.boolean(),
  is_archived: z.boolean(),
});
export type WorkType = z.infer<typeof WorkTypeSchema>;

const NameSchema = z.string().trim().min(1).max(CONFIG_NAME_MAX_LENGTH);
const ShortLabelSchema = z.string().trim().length(1);
const PositionSchema = z.number().int().min(0).max(999);
const IconSchema = z.string().trim().min(1).max(40);

// `is_default` only accepts true: a default is moved by choosing another, never by clearing one.
export const CreateWorkflowStatusSchema = z.object({
  name: NameSchema,
  category: z.enum(STATUS_CATEGORIES),
  color: z.enum(LABEL_COLORS).optional(),
  short_label: ShortLabelSchema.optional(),
  position: PositionSchema.optional(),
  is_default: z.literal(true).optional(),
});
export type CreateWorkflowStatus = z.infer<typeof CreateWorkflowStatusSchema>;

export const UpdateWorkflowStatusSchema = z.object({
  name: NameSchema.optional(),
  category: z.enum(STATUS_CATEGORIES).optional(),
  color: z.enum(LABEL_COLORS).optional(),
  short_label: ShortLabelSchema.optional(),
  position: PositionSchema.optional(),
  is_default: z.literal(true).optional(),
  is_archived: z.boolean().optional(),
});
export type UpdateWorkflowStatus = z.infer<typeof UpdateWorkflowStatusSchema>;

export const CreatePrioritySchema = z.object({
  name: NameSchema,
  color: z.enum(LABEL_COLORS).optional(),
  short_label: ShortLabelSchema.optional(),
  position: PositionSchema.optional(),
  is_default: z.literal(true).optional(),
});
export type CreatePriority = z.infer<typeof CreatePrioritySchema>;

export const UpdatePrioritySchema = CreatePrioritySchema.partial();
export type UpdatePriority = z.infer<typeof UpdatePrioritySchema>;

export const CreateIssueTypeSchema = CreatePrioritySchema.extend({ icon: IconSchema.nullable().optional() });
export type CreateIssueType = z.infer<typeof CreateIssueTypeSchema>;

export const UpdateIssueTypeSchema = CreateIssueTypeSchema.partial();
export type UpdateIssueType = z.infer<typeof UpdateIssueTypeSchema>;

export const CreateWorkTypeSchema = z.object({
  name: NameSchema,
  short_label: ShortLabelSchema.optional(),
  position: PositionSchema.optional(),
  is_default: z.literal(true).optional(),
});
export type CreateWorkType = z.infer<typeof CreateWorkTypeSchema>;

export const UpdateWorkTypeSchema = z.object({
  name: NameSchema.optional(),
  short_label: ShortLabelSchema.optional(),
  position: PositionSchema.optional(),
  is_default: z.literal(true).optional(),
  is_archived: z.boolean().optional(),
});
export type UpdateWorkType = z.infer<typeof UpdateWorkTypeSchema>;

interface SeedValue {
  name: string;
  color: LabelColor;
  short_label: string;
}

// What every new project starts with — docs/data-model.md#project-configuration.
export const SEED_STATUSES: readonly (SeedValue & { category: StatusCategory; is_default?: true })[] = [
  { name: 'Submitted', category: 'backlog', color: 'gray-1', short_label: 'S' },
  { name: 'Open', category: 'unstarted', color: 'blue-2', short_label: 'O', is_default: true },
  { name: 'In Progress', category: 'started', color: 'yellow-2', short_label: 'I' },
  { name: 'Reopened', category: 'unstarted', color: 'orange-2', short_label: 'R' },
  { name: "Can't Reproduce", category: 'cancelled', color: 'gray-2', short_label: 'C' },
  { name: 'Duplicate', category: 'cancelled', color: 'gray-2', short_label: 'D' },
  { name: 'Fixed', category: 'done', color: 'green-2', short_label: 'F' },
  { name: "Won't fix", category: 'cancelled', color: 'gray-2', short_label: 'W' },
  { name: 'Obsolete', category: 'cancelled', color: 'gray-2', short_label: 'O' },
  { name: 'Closed', category: 'done', color: 'green-3', short_label: 'C' },
];

export const SEED_PRIORITIES: readonly (SeedValue & { is_default?: true })[] = [
  { name: 'Show-stopper', color: 'red-3', short_label: 'S' },
  { name: 'Critical', color: 'pink-3', short_label: 'C' },
  { name: 'Major', color: 'yellow-2', short_label: 'M' },
  { name: 'Normal', color: 'green-1', short_label: 'N', is_default: true },
  { name: 'Minor', color: 'gray-4', short_label: 'M' },
];

export const SEED_ISSUE_TYPES: readonly (SeedValue & { is_default?: true })[] = [
  { name: 'Bug', color: 'red-2', short_label: 'B', is_default: true },
  { name: 'Feature', color: 'blue-2', short_label: 'F' },
  { name: 'Task', color: 'gray-2', short_label: 'T' },
  { name: 'Epic', color: 'pink-2', short_label: 'E' },
];

export const SEED_WORK_TYPES: readonly { name: string; short_label: string; is_default?: true }[] = [
  { name: 'Development', short_label: 'D', is_default: true },
  { name: 'Documentation', short_label: 'D' },
  { name: 'Implementation', short_label: 'I' },
  { name: 'Investigation', short_label: 'I' },
  { name: 'Maintenance', short_label: 'M' },
  { name: 'Observation', short_label: 'O' },
  { name: 'Testing', short_label: 'T' },
];

// Every new project's board: one column per group of status categories — docs/data-model.md#boards.
export const SEED_BOARD_COLUMNS: readonly { name: string; categories: readonly StatusCategory[] }[] = [
  { name: 'To do', categories: ['backlog', 'unstarted'] },
  { name: 'In progress', categories: ['started'] },
  { name: 'Done', categories: ['done', 'cancelled'] },
];
// Lanes of the seeded board: the issues of this type, when the project has it.
export const SEED_BOARD_SWIMLANE_TYPE = 'Epic';
