import { z } from 'zod';
import { AttachmentIdsSchema } from './attachments.ts';
import { WORK_ITEM_MAX_RECORDS } from './constants.ts';
import { WorkItemAttributeRefSchema, WorkItemAttributesInputSchema } from './custom-fields.ts';
import { MemberRefSchema } from './organizations.ts';

export const WorkItemSchema = z.object({
  id: z.number().int(),
  // The issue the time was logged on: this one, or a subtask when a parent lists its subtree.
  issue: z.string(),
  author: MemberRefSchema,
  created_by: MemberRefSchema,
  work_date: z.iso.date(),
  duration_minutes: z.number().int(),
  work_type: z.object({ name: z.string(), short_label: z.string() }).nullable(),
  // The project's own work item attributes that are set, in attribute order.
  attributes: z.array(WorkItemAttributeRefSchema),
  description_md: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  me: z.object({ can_edit: z.boolean(), can_delete: z.boolean() }),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

// Integer minutes, or a duration such as `1h 30m` read with the organisation's calendar.
const DurationSchema = z.union([z.number().int().min(1).max(10_000_000), z.string().trim().min(1).max(40)]);
const UsernameSchema = z.string().trim().min(1).max(40);
const WorkTypeNameSchema = z.string().trim().min(1).max(100);
// Bounded above the 16KB product limit so the service, not the parser, answers with the catalogue error.
const NoteSchema = z.string().max(100_000);

export const WorkItemRecordSchema = z.union([
  z.object({ work_date: z.iso.date(), duration: DurationSchema }).strict(),
  // A range writes one independent row per working day, each with this duration.
  z.object({ from: z.iso.date(), to: z.iso.date(), duration: DurationSchema }).strict(),
]);
export type WorkItemRecord = z.infer<typeof WorkItemRecordSchema>;

export const CreateWorkItemsSchema = z.object({
  author: UsernameSchema.optional(),
  // Absent takes the project's default work type; null logs time without one.
  work_type: WorkTypeNameSchema.nullable().optional(),
  description_md: NoteSchema.optional(),
  attributes: WorkItemAttributesInputSchema.optional(),
  records: z.array(WorkItemRecordSchema).min(1).max(WORK_ITEM_MAX_RECORDS),
  // Claimed by the first record created.
  attachment_ids: AttachmentIdsSchema.optional(),
});
export type CreateWorkItems = z.infer<typeof CreateWorkItemsSchema>;

export const UpdateWorkItemSchema = z.object({
  author: UsernameSchema.optional(),
  work_date: z.iso.date().optional(),
  duration: DurationSchema.optional(),
  work_type: WorkTypeNameSchema.nullable().optional(),
  description_md: NoteSchema.optional(),
  attributes: WorkItemAttributesInputSchema.optional(),
});
export type UpdateWorkItem = z.infer<typeof UpdateWorkItemSchema>;

// The readable snapshot a `time_logged` history row carries on each side.
export const WorkItemSnapshotSchema = z.object({
  work_item_id: z.number().int(),
  author: z.string(),
  work_date: z.iso.date(),
  minutes: z.number().int(),
  work_type: z.string().nullable(),
  // Attribute name → value name, only those set.
  attributes: z.record(z.string(), z.string()).optional(),
});
export type WorkItemSnapshot = z.infer<typeof WorkItemSnapshotSchema>;
