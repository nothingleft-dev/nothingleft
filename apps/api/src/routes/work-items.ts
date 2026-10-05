import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateWorkItemsSchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  UpdateWorkItemSchema,
  WorkItemSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { WorkItemsService } from '@services/work-items.service';

type Deps = { workItems: WorkItemsService };

const KeyParams = z.object({ key: z.string().min(1).max(40) });
const WorkItemParams = KeyParams.extend({ id: z.coerce.number().int().positive() });
const ListQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  include: z.enum(['subtasks']).optional(),
});
const WorkItemResponse = successEnvelope(WorkItemSchema);
const WorkItemsResponse = successEnvelope(z.array(WorkItemSchema));

const workItemsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { workItems }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/issues/:key/work-items',
    { schema: { params: KeyParams, querystring: ListQuery, response: { 200: WorkItemsResponse } } },
    async (request, reply) => {
      const { cursor, limit, include } = request.query;
      const { data, pagination } = await workItems.list(
        request.principal!,
        request.params.key,
        { cursor, limit, subtasks: include === 'subtasks' },
        orgHints(request),
      );
      return reply.ok(data, { pagination });
    },
  );

  app.post(
    '/v1/issues/:key/work-items',
    { schema: { params: KeyParams, body: CreateWorkItemsSchema, response: { 201: WorkItemsResponse } } },
    async (request, reply) => {
      const created = await workItems.create(request.principal!, request.params.key, request.body, orgHints(request));
      return reply.okList(created, { status: 201 });
    },
  );

  app.get(
    '/v1/issues/:key/work-items/:id',
    { schema: { params: WorkItemParams, response: { 200: WorkItemResponse } } },
    async (request, reply) =>
      reply.ok(await workItems.get(request.principal!, request.params.key, request.params.id, orgHints(request))),
  );

  app.patch(
    '/v1/issues/:key/work-items/:id',
    { schema: { params: WorkItemParams, body: UpdateWorkItemSchema, response: { 200: WorkItemResponse } } },
    async (request, reply) =>
      reply.ok(
        await workItems.update(
          request.principal!,
          request.params.key,
          request.params.id,
          request.body,
          orgHints(request),
        ),
      ),
  );

  app.delete(
    '/v1/issues/:key/work-items/:id',
    { schema: { params: WorkItemParams, response: { 200: WorkItemResponse } } },
    async (request, reply) =>
      reply.ok(await workItems.remove(request.principal!, request.params.key, request.params.id, orgHints(request))),
  );
};

export default workItemsRoutes;
