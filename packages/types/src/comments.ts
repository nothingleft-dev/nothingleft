import { z } from 'zod';
import { AttachmentIdsSchema } from './attachments.ts';
import { MemberRefSchema } from './organizations.ts';

export const CommentSchema = z.object({
  id: z.number().int(),
  issue: z.string(),
  author: MemberRefSchema,
  body_md: z.string(),
  created_at: z.string(),
  edited_at: z.string().nullable(),
  // Set only on the DELETE response; a deleted comment is never listed.
  deleted_at: z.string().nullable(),
  me: z.object({ can_edit: z.boolean(), can_delete: z.boolean() }),
});
export type Comment = z.infer<typeof CommentSchema>;

// Bounded far above the 256KB product limit so the service, not the parser, answers with the catalogue error.
const BodySchema = z.string().max(1_000_000);

export const CreateCommentSchema = z.object({ body_md: BodySchema, attachment_ids: AttachmentIdsSchema.optional() });
export type CreateComment = z.infer<typeof CreateCommentSchema>;

export const UpdateCommentSchema = z.object({ body_md: BodySchema });
export type UpdateComment = z.infer<typeof UpdateCommentSchema>;

// `index` counts task checkboxes in document order, as the renderer's `data-task` numbers them.
export const ToggleTaskSchema = z.object({ index: z.number().int().min(0).max(10_000), checked: z.boolean() });
export type ToggleTask = z.infer<typeof ToggleTaskSchema>;
