import { z } from 'zod';
import { AttachmentIdsSchema } from './attachments.ts';
import {
  ARTICLE_CHILDREN_ON_DELETE,
  ARTICLE_SLUG_MAX_LENGTH,
  ARTICLE_STATUSES,
  GLOBAL_SEARCH_DEFAULT_LIMIT,
  GLOBAL_SEARCH_MAX_LIMIT,
  ISSUE_TITLE_MAX_LENGTH,
  LABEL_COLORS,
} from './constants.ts';
import { CommentSchema } from './comments.ts';
import { ErrorBodySchema } from './envelope.ts';
import { IssueRefSchema } from './issues.ts';
import { MemberRefSchema } from './organizations.ts';
import { TagInputsSchema, TagRefSchema } from './tags.ts';

const ProjectRefSchema = z.object({ key: z.string(), name: z.string() });

export const ArticleRefSchema = z.object({ slug: z.string(), title: z.string() });
export type ArticleRef = z.infer<typeof ArticleRefSchema>;

export const ArticleSchema = z.object({
  project: ProjectRefSchema,
  slug: z.string(),
  title: z.string(),
  status: z.enum(ARTICLE_STATUSES),
  body_md: z.string(),
  // The nearest ancestor the caller can read: a draft parent they cannot see is skipped.
  parent: ArticleRefSchema.nullable(),
  // Readable ancestors, root first — the breadcrumb.
  path: z.array(ArticleRefSchema),
  position: z.number().int(),
  // Children the caller can read.
  child_count: z.number().int(),
  tags: z.array(TagRefSchema),
  created_by: MemberRefSchema,
  updated_by: MemberRefSchema,
  created_at: z.string(),
  updated_at: z.string(),
  // The latest publish; kept when the article returns to draft.
  published_at: z.string().nullable(),
  comment_count: z.number().int(),
  // Ready files on the article and its comments.
  attachment_count: z.number().int(),
  watcher_count: z.number().int(),
  me: z.object({
    starred: z.boolean(),
    watching: z.boolean(),
    can_edit: z.boolean(),
    can_publish: z.boolean(),
    can_move: z.boolean(),
    can_delete: z.boolean(),
    can_comment: z.boolean(),
  }),
  deleted_at: z.string().nullable(),
  // Set only on a deleted article: after this instant the purge removes it for good.
  restorable_until: z.string().nullable(),
});
export type Article = z.infer<typeof ArticleSchema>;

// One row of a project's tree, depth-first in sibling order.
export const ArticleNodeSchema = z.object({
  slug: z.string(),
  title: z.string(),
  status: z.enum(ARTICLE_STATUSES),
  // The nearest readable ancestor's slug; null at the top.
  parent: z.string().nullable(),
  depth: z.number().int(),
  position: z.number().int(),
  child_count: z.number().int(),
  starred: z.boolean(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  restorable_until: z.string().nullable(),
});
export type ArticleNode = z.infer<typeof ArticleNodeSchema>;

export const ArticleSummarySchema = z.object({
  project: ProjectRefSchema,
  slug: z.string(),
  title: z.string(),
  status: z.enum(ARTICLE_STATUSES),
  parent: ArticleRefSchema.nullable(),
  tags: z.array(TagRefSchema),
  created_by: MemberRefSchema,
  updated_by: MemberRefSchema,
  created_at: z.string(),
  updated_at: z.string(),
  published_at: z.string().nullable(),
  // Plain text: the passage matching the free text, else the start of the body.
  excerpt: z.string(),
  starred: z.boolean(),
});
export type ArticleSummary = z.infer<typeof ArticleSummarySchema>;

const TitleSchema = z.string().trim().min(1).max(ISSUE_TITLE_MAX_LENGTH);
// Bounded far above the 256KB product limit so the service, not the parser, answers with the catalogue error.
const BodySchema = z.string().max(1_000_000);
const SlugInputSchema = z.string().trim().min(1).max(ARTICLE_SLUG_MAX_LENGTH);
// Another article of the project, by slug or title.
const ArticleNameSchema = z.string().trim().min(1).max(ISSUE_TITLE_MAX_LENGTH);

const placement = {
  // Placed immediately before or after this sibling; without either, last among its siblings.
  before: ArticleNameSchema.optional(),
  after: ArticleNameSchema.optional(),
};
const oneAnchor = (b: { before?: string | undefined; after?: string | undefined }) =>
  b.before === undefined || b.after === undefined;

export const CreateArticleSchema = z
  .object({
    title: TitleSchema,
    body_md: BodySchema.optional(),
    slug: SlugInputSchema.optional(),
    status: z.enum(ARTICLE_STATUSES).default('draft'),
    parent: ArticleNameSchema.nullable().optional(),
    ...placement,
    tags: TagInputsSchema.optional(),
    color: z.enum(LABEL_COLORS).optional(),
    attachment_ids: AttachmentIdsSchema.optional(),
  })
  .refine(oneAnchor, { message: 'Send at most one of before or after.', path: ['after'] });
export type CreateArticle = z.input<typeof CreateArticleSchema>;

export const UpdateArticleSchema = z
  .object({
    title: TitleSchema.optional(),
    body_md: BodySchema.optional(),
    slug: SlugInputSchema.optional(),
    status: z.enum(ARTICLE_STATUSES).optional(),
    // null moves it to the top level.
    parent: ArticleNameSchema.nullable().optional(),
    ...placement,
  })
  .refine(oneAnchor, { message: 'Send at most one of before or after.', path: ['after'] });
export type UpdateArticle = z.infer<typeof UpdateArticleSchema>;

export const DeleteArticleQuerySchema = z.object({
  // Required when the article has children.
  children: z.enum(ARTICLE_CHILDREN_ON_DELETE).optional(),
});
export type DeleteArticleQuery = z.infer<typeof DeleteArticleQuerySchema>;

export const ArticleCommentSchema = CommentSchema.omit({ issue: true }).extend({
  article: z.object({ project: z.string(), slug: z.string() }),
});
export type ArticleComment = z.infer<typeof ArticleCommentSchema>;

export const GlobalSearchQuerySchema = z.object({
  q: z.string().max(2000).default(''),
  project: z.string().trim().min(1).max(20).optional(),
  limit: z.coerce.number().int().min(1).max(GLOBAL_SEARCH_MAX_LIMIT).default(GLOBAL_SEARCH_DEFAULT_LIMIT),
});

// A group whose vocabulary cannot read the query carries the error and no items.
const searchGroup = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    error: ErrorBodySchema.omit({ request_id: true }).nullable(),
  });

export const GlobalSearchResultSchema = z.object({
  issues: searchGroup(IssueRefSchema.extend({ project: ProjectRefSchema })),
  articles: searchGroup(ArticleSummarySchema),
});
export type GlobalSearchResult = z.infer<typeof GlobalSearchResultSchema>;
