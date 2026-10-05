import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  BacklogMoveSchema,
  CreateSprintSchema,
  FinishSprintSchema,
  IssueListItemSchema,
  IssueSchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  QueryTextSchema,
  SPRINT_STATES,
  SprintFinishResultSchema,
  SprintSchema,
  StartSprintSchema,
  UpdateSprintSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { SprintsService } from '@services/sprints.service';

type Deps = { sprints: SprintsService };

const KeyParams = z.object({ key: z.string().min(1).max(20) });
const SprintParams = KeyParams.extend({ sprint: z.string().min(1).max(100) });
const StateQuery = z.object({
  state: z
    .string()
    .max(100)
    .transform(v => v.split(',').map(s => s.trim()))
    .pipe(z.array(z.enum(SPRINT_STATES)))
    .optional(),
});
const BacklogQuery = z.object({
  sprint: z.string().trim().min(1).max(100).optional(),
  q: QueryTextSchema.optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

const one = successEnvelope(SprintSchema);
const many = successEnvelope(z.array(SprintSchema));

const sprintsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { sprints }) => {
  app.addHook('preHandler', requireAuth);

  app.get('/v1/sprints', { schema: { querystring: StateQuery, response: { 200: many } } }, async (request, reply) =>
    reply.okList(await sprints.listAcross(request.principal!, request.query.state, orgHints(request))),
  );

  app.get(
    '/v1/projects/:key/sprints',
    { schema: { params: KeyParams, querystring: StateQuery, response: { 200: many } } },
    async (request, reply) =>
      reply.okList(await sprints.list(request.principal!, request.params.key, request.query.state, orgHints(request))),
  );

  app.post(
    '/v1/projects/:key/sprints',
    { schema: { params: KeyParams, body: CreateSprintSchema, response: { 201: one } } },
    async (request, reply) =>
      reply.ok(await sprints.create(request.principal!, request.params.key, request.body, orgHints(request)), {
        status: 201,
      }),
  );

  app.get(
    '/v1/projects/:key/sprints/:sprint',
    { schema: { params: SprintParams, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(await sprints.get(request.principal!, request.params.key, request.params.sprint, orgHints(request))),
  );

  app.patch(
    '/v1/projects/:key/sprints/:sprint',
    { schema: { params: SprintParams, body: UpdateSprintSchema, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(
        await sprints.update(
          request.principal!,
          request.params.key,
          request.params.sprint,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    '/v1/projects/:key/sprints/:sprint',
    { schema: { params: SprintParams, response: { 200: one } } },
    async (request, reply) =>
      reply.ok(await sprints.remove(request.principal!, request.params.key, request.params.sprint, orgHints(request))),
  );

  app.post(
    '/v1/projects/:key/sprints/:sprint/start',
    { schema: { params: SprintParams, body: StartSprintSchema.nullish(), response: { 200: one } } },
    async (request, reply) =>
      reply.ok(
        await sprints.start(
          request.principal!,
          request.params.key,
          request.params.sprint,
          request.body ?? {},
          orgHints(request),
        ),
      ),
  );

  app.post(
    '/v1/projects/:key/sprints/:sprint/finish',
    {
      schema: {
        params: SprintParams,
        body: FinishSprintSchema,
        response: { 200: successEnvelope(SprintFinishResultSchema) },
      },
    },
    async (request, reply) =>
      reply.ok(
        await sprints.finish(
          request.principal!,
          request.params.key,
          request.params.sprint,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.get(
    '/v1/projects/:key/backlog',
    {
      schema: {
        params: KeyParams,
        querystring: BacklogQuery,
        response: { 200: successEnvelope(z.array(IssueListItemSchema)) },
      },
    },
    async (request, reply) => {
      const { data, pagination } = await sprints.backlog(
        request.principal!,
        request.params.key,
        request.query,
        orgHints(request),
      );
      return reply.ok(data, { pagination });
    },
  );

  app.post(
    '/v1/projects/:key/backlog/move',
    {
      schema: { params: KeyParams, body: BacklogMoveSchema, response: { 200: successEnvelope(z.array(IssueSchema)) } },
    },
    async (request, reply) =>
      reply.okList(await sprints.move(request.principal!, request.params.key, request.body, orgHints(request))),
  );
};

export default sprintsRoutes;
