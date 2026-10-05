import { z } from 'zod';
import { ATTACHMENT_FILENAME_MAX_LENGTH, ATTACHMENT_STATUSES, ATTACHMENTS_PER_ISSUE_MAX } from './constants.ts';
import { MemberRefSchema } from './organizations.ts';

export const AttachmentSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int(),
  // The permanent file URL; markdown stores this, never a presigned one.
  url: z.url(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  // null while a draft: uploaded from a create form, not yet claimed by the new issue.
  issue: z.string().nullable(),
  // Set instead of issue on a file in a knowledge base article or its comments.
  article: z.object({ project: z.string(), slug: z.string() }).nullable(),
  comment_id: z.number().int().nullable(),
  work_item_id: z.number().int().nullable(),
  status: z.enum(ATTACHMENT_STATUSES),
  // false when the file sits in the organisation's own bucket and that bucket is disconnected
  // or failing: the file URL answers an error, so the web draws a placeholder instead.
  available: z.boolean(),
  // Referenced from the issue description or a live comment, so the list hides it by default.
  inline: z.boolean(),
  created_by: MemberRefSchema,
  created_at: z.string(),
  deleted_at: z.string().nullable(),
  me: z.object({ can_delete: z.boolean() }),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

const Sha256Base64Schema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);
const DimensionSchema = z.number().int().min(1).max(100_000);

export const PresignAttachmentSchema = z
  .object({
    filename: z.string().trim().min(1).max(ATTACHMENT_FILENAME_MAX_LENGTH),
    mime: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/),
    // Checked by the service against ATTACHMENT_MAX_BYTES, so an oversized file gets the catalogue error.
    size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sha256: Sha256Base64Schema,
    issue: z.string().trim().min(1).max(40).optional(),
    comment_id: z.number().int().positive().optional(),
    work_item_id: z.number().int().positive().optional(),
    // A draft, for a form whose issue, comment or work item does not exist yet — or, with article, that project's article.
    project: z.string().trim().min(1).max(20).optional(),
    // An article of project, by slug.
    article: z.string().trim().min(1).max(200).optional(),
    width: DimensionSchema.optional(),
    height: DimensionSchema.optional(),
  })
  .refine(b => (b.issue === undefined) !== (b.project === undefined), {
    message: 'Send exactly one of issue or project.',
    path: ['issue'],
  })
  .refine(b => b.article === undefined || b.project !== undefined, {
    message: 'article needs project.',
    path: ['article'],
  })
  .refine(b => b.issue !== undefined || b.article !== undefined || b.comment_id === undefined, {
    message: 'comment_id needs issue or article.',
    path: ['comment_id'],
  })
  .refine(b => b.issue !== undefined || b.work_item_id === undefined, {
    message: 'work_item_id needs issue.',
    path: ['work_item_id'],
  })
  .refine(b => b.comment_id === undefined || b.work_item_id === undefined, {
    message: 'Send at most one of comment_id or work_item_id.',
    path: ['work_item_id'],
  });
export type PresignAttachment = z.infer<typeof PresignAttachmentSchema>;

export const AttachmentPresignSchema = z.object({
  attachment: AttachmentSchema,
  upload_url: z.url(),
  // Every one must be sent on the PUT; the signature covers them.
  upload_headers: z.record(z.string(), z.string()),
  expires_in: z.number().int().positive(),
});
export type AttachmentPresign = z.infer<typeof AttachmentPresignSchema>;

// Draft uploads a create request claims, in the order they should list.
export const AttachmentIdsSchema = z.array(z.uuid()).max(ATTACHMENTS_PER_ISSUE_MAX);

// The readable snapshot an `attached` / `detached` history row carries.
export const AttachmentSnapshotSchema = z.object({
  attachment_id: z.uuid(),
  filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int(),
  comment_id: z.number().int().nullable(),
  work_item_id: z.number().int().nullable(),
});
export type AttachmentSnapshot = z.infer<typeof AttachmentSnapshotSchema>;
