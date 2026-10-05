import { z } from 'zod';
import { ISSUE_TAGS_MAX_PER_REQUEST, LABEL_COLORS, TAG_CONTEXTS, TAG_NAME_MAX_LENGTH } from './constants.ts';

export const TagRefSchema = z.object({
  name: z.string(),
  slug: z.string(),
  color: z.enum(LABEL_COLORS),
});
export type TagRef = z.infer<typeof TagRefSchema>;

// Usage counted over what the caller can read: live issues, and articles they may open.
export const TagSchema = TagRefSchema.extend({
  issue_count: z.number().int(),
  article_count: z.number().int(),
});
export type Tag = z.infer<typeof TagSchema>;

export const TagListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  // Ranks tags used in this context first; never filters by it.
  context: z.enum(TAG_CONTEXTS).optional(),
  // Counts, and in_use, over this project only.
  project: z.string().trim().min(1).max(20).optional(),
  // Only tags with a use in the context (or either, without one): the knowledge base's tag list.
  in_use: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional(),
});

export const TagNameSchema = z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH);

// A name or slug, or one with the colour it takes if it turns out to be new.
export const TagInputSchema = z.union([
  TagNameSchema,
  z.object({ name: TagNameSchema, color: z.enum(LABEL_COLORS).optional() }),
]);
export type TagInput = z.infer<typeof TagInputSchema>;

export const TagInputsSchema = z.array(TagInputSchema).min(1).max(ISSUE_TAGS_MAX_PER_REQUEST);

// A new tag takes its own `color`, else the request's, else one derived from its slug; an existing tag keeps its own.
export const ApplyTagsSchema = z.object({
  tags: TagInputsSchema,
  color: z.enum(LABEL_COLORS).optional(),
});
export type ApplyTags = z.infer<typeof ApplyTagsSchema>;
