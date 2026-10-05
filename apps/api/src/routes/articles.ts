import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ApplyTagsSchema,
  ArticleCommentSchema,
  ArticleNodeSchema,
  ArticleSchema,
  ArticleSummarySchema,
  AttachmentSchema,
  CreateArticleSchema,
  CreateCommentSchema,
  DeleteArticleQuerySchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  QueryTextSchema,
  ToggleTaskSchema,
  UpdateArticleSchema,
  UpdateCommentSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { ArticleCommentsService } from '@services/article-comments.service';
import type { ArticlesService } from '@services/articles.service';
import type { AttachmentsService } from '@services/attachments.service';

type Deps = { articles: ArticlesService; comments: ArticleCommentsService; attachments: AttachmentsService };

const ProjectParams = z.object({ key: z.string().min(1).max(20) });
const ArticleParams = ProjectParams.extend({ slug: z.string().min(1).max(200) });
const CommentParams = ArticleParams.extend({ id: z.coerce.number().int().positive() });
const TagParams = ArticleParams.extend({ tag: z.string().min(1).max(200) });
const IssueParams = z.object({ key: z.string().min(1).max(40) });
const TreeQuery = z.object({
  deleted: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .default(false),
});
const ListQuery = z.object({
  q: QueryTextSchema.optional(),
  project: z.string().trim().min(1).max(20).optional(),
  sort: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
const CommentListQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
});

const ArticleResponse = successEnvelope(ArticleSchema);
const NodesResponse = successEnvelope(z.array(ArticleNodeSchema));
const SummariesResponse = successEnvelope(z.array(ArticleSummarySchema));
const CommentResponse = successEnvelope(ArticleCommentSchema);
const CommentsResponse = successEnvelope(z.array(ArticleCommentSchema));
const AttachmentsResponse = successEnvelope(z.array(AttachmentSchema));

const articlesRoutes: FastifyPluginAsyncZod<Deps> = async (app, { articles, comments, attachments }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/articles',
    { schema: { querystring: ListQuery, response: { 200: SummariesResponse } } },
    async (request, reply) => {
      const { data, pagination } = await articles.list(request.principal!, request.query, orgHints(request));
      return reply.ok(data, { pagination });
    },
  );

  app.get(
    '/v1/issues/:key/articles',
    { schema: { params: IssueParams, response: { 200: SummariesResponse } } },
    async (request, reply) =>
      reply.okList(await articles.referencedBy(request.principal!, request.params.key, orgHints(request))),
  );

  app.get(
    '/v1/projects/:key/articles',
    { schema: { params: ProjectParams, querystring: TreeQuery, response: { 200: NodesResponse } } },
    async (request, reply) =>
      reply.okList(await articles.tree(request.principal!, request.params.key, request.query, orgHints(request))),
  );

  app.post(
    '/v1/projects/:key/articles',
    { schema: { params: ProjectParams, body: CreateArticleSchema, response: { 201: ArticleResponse } } },
    async (request, reply) =>
      reply.ok(await articles.create(request.principal!, request.params.key, request.body, orgHints(request)), {
        status: 201,
      }),
  );

  app.get(
    '/v1/projects/:key/articles/:slug',
    { schema: { params: ArticleParams, response: { 200: ArticleResponse } } },
    async (request, reply) =>
      reply.ok(await articles.get(request.principal!, request.params.key, request.params.slug, orgHints(request))),
  );

  app.patch(
    '/v1/projects/:key/articles/:slug',
    { schema: { params: ArticleParams, body: UpdateArticleSchema, response: { 200: ArticleResponse } } },
    async (request, reply) =>
      reply.ok(
        await articles.update(
          request.principal!,
          request.params.key,
          request.params.slug,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    '/v1/projects/:key/articles/:slug',
    { schema: { params: ArticleParams, querystring: DeleteArticleQuerySchema, response: { 200: ArticleResponse } } },
    async (request, reply) =>
      reply.ok(
        await articles.remove(
          request.principal!,
          request.params.key,
          request.params.slug,
          request.query,
          orgHints(request),
        ),
      ),
  );

  app.post(
    '/v1/projects/:key/articles/:slug/restore',
    { schema: { params: ArticleParams, response: { 200: ArticleResponse } } },
    async (request, reply) =>
      reply.ok(await articles.restore(request.principal!, request.params.key, request.params.slug, orgHints(request))),
  );

  for (const signal of ['star', 'watch'] as const) {
    for (const [method, on] of [
      ['put', true],
      ['delete', false],
    ] as const) {
      app[method](
        `/v1/projects/:key/articles/:slug/${signal}`,
        { schema: { params: ArticleParams, response: { 200: ArticleResponse } } },
        async (request, reply) =>
          reply.ok(
            await articles.setSignal(
              request.principal!,
              request.params.key,
              request.params.slug,
              signal,
              on,
              orgHints(request),
            ),
          ),
      );
    }
  }

  app.post(
    '/v1/projects/:key/articles/:slug/tags',
    { schema: { params: ArticleParams, body: ApplyTagsSchema, response: { 200: ArticleResponse } } },
    async (request, reply) =>
      reply.ok(
        await articles.applyTags(
          request.principal!,
          request.params.key,
          request.params.slug,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    '/v1/projects/:key/articles/:slug/tags/:tag',
    { schema: { params: TagParams, response: { 200: ArticleResponse } } },
    async (request, reply) =>
      reply.ok(
        await articles.removeTag(
          request.principal!,
          request.params.key,
          request.params.slug,
          request.params.tag,
          orgHints(request),
        ),
      ),
  );

  app.post(
    '/v1/projects/:key/articles/:slug/tasks/toggle',
    { schema: { params: ArticleParams, body: ToggleTaskSchema, response: { 200: ArticleResponse } } },
    async (request, reply) =>
      reply.ok(
        await articles.toggleTask(
          request.principal!,
          request.params.key,
          request.params.slug,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.get(
    '/v1/projects/:key/articles/:slug/comments',
    { schema: { params: ArticleParams, querystring: CommentListQuery, response: { 200: CommentsResponse } } },
    async (request, reply) => {
      const { data, pagination } = await comments.list(
        request.principal!,
        request.params.key,
        request.params.slug,
        request.query,
        orgHints(request),
      );
      return reply.ok(data, { pagination });
    },
  );

  app.post(
    '/v1/projects/:key/articles/:slug/comments',
    { schema: { params: ArticleParams, body: CreateCommentSchema, response: { 201: CommentResponse } } },
    async (request, reply) =>
      reply.ok(
        await comments.create(
          request.principal!,
          request.params.key,
          request.params.slug,
          request.body,
          orgHints(request),
        ),
        { status: 201 },
      ),
  );

  app.get(
    '/v1/projects/:key/articles/:slug/comments/:id',
    { schema: { params: CommentParams, response: { 200: CommentResponse } } },
    async (request, reply) => {
      const { key, slug, id } = request.params;
      return reply.ok(await comments.get(request.principal!, key, slug, id, orgHints(request)));
    },
  );

  app.patch(
    '/v1/projects/:key/articles/:slug/comments/:id',
    { schema: { params: CommentParams, body: UpdateCommentSchema, response: { 200: CommentResponse } } },
    async (request, reply) => {
      const { key, slug, id } = request.params;
      return reply.ok(await comments.update(request.principal!, key, slug, id, request.body, orgHints(request)));
    },
  );

  app.delete(
    '/v1/projects/:key/articles/:slug/comments/:id',
    { schema: { params: CommentParams, response: { 200: CommentResponse } } },
    async (request, reply) => {
      const { key, slug, id } = request.params;
      return reply.ok(await comments.remove(request.principal!, key, slug, id, orgHints(request)));
    },
  );

  app.post(
    '/v1/projects/:key/articles/:slug/comments/:id/tasks/toggle',
    { schema: { params: CommentParams, body: ToggleTaskSchema, response: { 200: CommentResponse } } },
    async (request, reply) => {
      const { key, slug, id } = request.params;
      return reply.ok(await comments.toggleTask(request.principal!, key, slug, id, request.body, orgHints(request)));
    },
  );

  app.get(
    '/v1/projects/:key/articles/:slug/attachments',
    { schema: { params: ArticleParams, response: { 200: AttachmentsResponse } } },
    async (request, reply) =>
      reply.okList(
        await attachments.listForArticle(
          request.principal!,
          request.params.key,
          request.params.slug,
          {},
          orgHints(request),
        ),
      ),
  );

  app.get(
    '/v1/projects/:key/articles/:slug/comments/:id/attachments',
    { schema: { params: CommentParams, response: { 200: AttachmentsResponse } } },
    async (request, reply) => {
      const { key, slug, id } = request.params;
      return reply.okList(
        await attachments.listForArticle(request.principal!, key, slug, { commentId: id }, orgHints(request)),
      );
    },
  );
};

export default articlesRoutes;
