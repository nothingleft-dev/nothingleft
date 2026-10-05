import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateSavedViewSchema, SavedViewSchema, UpdateSavedViewSchema, successEnvelope } from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { SavedViewsService } from '@services/saved-views.service';

type Deps = { savedViews: SavedViewsService };

const NameParams = z.object({ name: z.string().min(1).max(100) });
const ViewResponse = successEnvelope(SavedViewSchema);
const ViewsResponse = successEnvelope(z.array(SavedViewSchema));

const savedViewsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { savedViews }) => {
  app.addHook('preHandler', requireAuth);

  app.get('/v1/saved-views', { schema: { response: { 200: ViewsResponse } } }, async (request, reply) =>
    reply.okList(await savedViews.list(request.principal!, orgHints(request))),
  );

  app.post(
    '/v1/saved-views',
    { schema: { body: CreateSavedViewSchema, response: { 201: ViewResponse } } },
    async (request, reply) =>
      reply.ok(await savedViews.create(request.principal!, request.body, orgHints(request)), { status: 201 }),
  );

  app.get(
    '/v1/saved-views/:name',
    { schema: { params: NameParams, response: { 200: ViewResponse } } },
    async (request, reply) =>
      reply.ok(await savedViews.get(request.principal!, request.params.name, orgHints(request))),
  );

  app.patch(
    '/v1/saved-views/:name',
    { schema: { params: NameParams, body: UpdateSavedViewSchema, response: { 200: ViewResponse } } },
    async (request, reply) =>
      reply.ok(await savedViews.update(request.principal!, request.params.name, request.body, orgHints(request))),
  );

  app.delete(
    '/v1/saved-views/:name',
    { schema: { params: NameParams, response: { 200: ViewResponse } } },
    async (request, reply) =>
      reply.ok(await savedViews.remove(request.principal!, request.params.name, orgHints(request))),
  );
};

export default savedViewsRoutes;
