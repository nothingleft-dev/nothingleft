import { z } from 'zod';
import { STATUS_CATEGORIES } from './constants.ts';

export const PaginationSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

// Group counts of a grouped issue list, over the whole filtered set rather than the page.
export const IssueGroupSchema = z.object({
  // null is the empty group: Unassigned, No due date, No tags.
  value: z.string().nullable(),
  label: z.string(),
  count: z.number().int(),
  color: z.string().nullable(),
  // Only with group_by=status: resolved groups start collapsed and the dot takes the category's texture.
  category: z.enum(STATUS_CATEGORIES).optional(),
});
export type IssueGroup = z.infer<typeof IssueGroupSchema>;

export const MetaSchema = z.object({
  request_id: z.string(),
  pagination: PaginationSchema.optional(),
  groups: z.array(IssueGroupSchema).optional(),
});
export type Meta = z.infer<typeof MetaSchema>;

export const ErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
  valid_values: z.array(z.string()).optional(),
  // A search query error: the characters of `q` at fault.
  span: z.object({ start: z.number().int(), end: z.number().int() }).optional(),
  // token.scope_missing: the scope a new token needs for this request.
  scope: z.string().optional(),
  request_id: z.string(),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export const ErrorEnvelopeSchema = z.object({ error: ErrorBodySchema });
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const successEnvelope = <T extends z.ZodTypeAny>(data: T) => z.object({ data, meta: MetaSchema });

export type SuccessEnvelope<T> = { data: T; meta: Meta };
