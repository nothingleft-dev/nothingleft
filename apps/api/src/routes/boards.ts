import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  BOARD_SWIMLANE_FIELDS,
  BOARD_SWIMLANES,
  BoardSchema,
  BoardViewSchema,
  CreateBoardSchema,
  QueryTextSchema,
  UpdateBoardSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { BoardsService } from '@services/boards.service';

type Deps = { boards: BoardsService };

const KeyParams = z.object({ key: z.string().min(1).max(20) });
const BoardParams = KeyParams.extend({ board: z.string().min(1).max(100) });
const SlugParams = z.object({ slug: z.string().min(1).max(100) });
const ViewQuery = z.object({
  sprint: z.string().trim().min(1).max(100).optional(),
  q: QueryTextSchema.optional(),
  swimlane_by: z.enum(BOARD_SWIMLANES).optional(),
  swimlane_field: z.enum(BOARD_SWIMLANE_FIELDS).optional(),
});

const one = successEnvelope(BoardSchema);

const boardsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { boards }) => {
  app.addHook('preHandler', requireAuth);

  app.get('/v1/boards/:slug', { schema: { params: SlugParams, response: { 200: one } } }, async (request, reply) =>
    reply.ok(await boards.getBySlug(request.principal!, request.params.slug, orgHints(request))),
  );

  app.get(
    '/v1/projects/:key/boards',
    { schema: { params: KeyParams, response: { 200: successEnvelope(z.array(BoardSchema)) } } },
    async (request, reply) =>
      reply.okList(await boards.list(request.principal!, request.params.key, orgHints(request))),
  );

  app.post(
    '/v1/projects/:key/boards',
    { schema: { params: KeyParams, body: CreateBoardSchema, response: { 201: one } } },
    async (request, reply) =>
      reply.ok(await boards.create(request.principal!, request.params.key, request.body, orgHints(request)), {
        status: 201,
      }),
  );

  app.get(
    '/v1/projects/:key/boards/:board',
    { schema: { params: BoardParams, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(await boards.get(request.principal!, request.params.key, request.params.board, orgHints(request))),
  );

  app.patch(
    '/v1/projects/:key/boards/:board',
    { schema: { params: BoardParams, body: UpdateBoardSchema, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(
        await boards.update(
          request.principal!,
          request.params.key,
          request.params.board,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    '/v1/projects/:key/boards/:board',
    { schema: { params: BoardParams, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(await boards.remove(request.principal!, request.params.key, request.params.board, orgHints(request))),
  );

  app.get(
    '/v1/projects/:key/boards/:board/view',
    { schema: { params: BoardParams, querystring: ViewQuery, response: { 200: successEnvelope(BoardViewSchema) } } },
    async (request, reply) =>
      reply.ok(
        await boards.view(
          request.principal!,
          request.params.key,
          request.params.board,
          request.query,
          orgHints(request),
        ),
      ),
  );
};

export default boardsRoutes;
