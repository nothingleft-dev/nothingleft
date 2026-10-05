import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CommentSchema,
  CreateCommentSchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  ToggleTaskSchema,
  UpdateCommentSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { CommentsService } from '@services/comments.service';

type Deps = { comments: CommentsService };

const KeyParams = z.object({ key: z.string().min(1).max(40) });
const CommentParams = KeyParams.extend({ id: z.coerce.number().int().positive() });
const ListQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
});
const CommentResponse = successEnvelope(CommentSchema);
const CommentsResponse = successEnvelope(z.array(CommentSchema));

const commentsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { comments }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/issues/:key/comments',
    { schema: { params: KeyParams, querystring: ListQuery, response: { 200: CommentsResponse } } },
    async (request, reply) => {
      const { data, pagination } = await comments.list(
        request.principal!,
        request.params.key,
        request.query,
        orgHints(request),
      );
      return reply.ok(data, { pagination });
    },
  );

  app.post(
    '/v1/issues/:key/comments',
    { schema: { params: KeyParams, body: CreateCommentSchema, response: { 201: CommentResponse } } },
    async (request, reply) =>
      reply.ok(await comments.create(request.principal!, request.params.key, request.body, orgHints(request)), {
        status: 201,
      }),
  );

  app.get(
    '/v1/issues/:key/comments/:id',
    { schema: { params: CommentParams, response: { 200: CommentResponse } } },
    async (request, reply) =>
      reply.ok(await comments.get(request.principal!, request.params.key, request.params.id, orgHints(request))),
  );

  app.patch(
    '/v1/issues/:key/comments/:id',
    { schema: { params: CommentParams, body: UpdateCommentSchema, response: { 200: CommentResponse } } },
    async (request, reply) =>
      reply.ok(
        await comments.update(
          request.principal!,
          request.params.key,
          request.params.id,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    '/v1/issues/:key/comments/:id',
    { schema: { params: CommentParams, response: { 200: CommentResponse } } },
    async (request, reply) =>
      reply.ok(await comments.remove(request.principal!, request.params.key, request.params.id, orgHints(request))),
  );

  app.post(
    '/v1/issues/:key/comments/:id/tasks/toggle',
    { schema: { params: CommentParams, body: ToggleTaskSchema, response: { 200: CommentResponse } } },
    async (request, reply) =>
      reply.ok(
        await comments.toggleTask(
          request.principal!,
          request.params.key,
          request.params.id,
          request.body,
          orgHints(request),
        ),
      ),
  );
};

export default commentsRoutes;
