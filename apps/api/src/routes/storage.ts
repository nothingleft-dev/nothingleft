import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConnectStorageSchema,
  DisconnectStorageSchema,
  StorageBrowserCheckInputSchema,
  StorageBrowserCheckSchema,
  StorageConnectionSchema,
  StorageFileSchema,
  StorageFilesQuerySchema,
  StorageOverviewSchema,
  VerifyStorageSchema,
  successEnvelope,
} from '@nothingleft/types';
import { requireAuth } from '@middleware/auth';
import type { StorageService } from '@services/storage.service';

type Deps = { storage: StorageService };

const SlugParams = z.object({ slug: z.string().min(1).max(100) });
const OverviewResponse = successEnvelope(StorageOverviewSchema);
const ConnectionResponse = successEnvelope(StorageConnectionSchema);
const FilesResponse = successEnvelope(z.array(StorageFileSchema));
const BrowserCheckResponse = successEnvelope(StorageBrowserCheckSchema);

const storageRoutes: FastifyPluginAsyncZod<Deps> = async (app, { storage }) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/v1/organizations/:slug/storage',
    { schema: { params: SlugParams, response: { 200: OverviewResponse } } },
    async (request, reply) => reply.ok(await storage.overview(request.principal!, request.params.slug)),
  );

  app.get(
    '/v1/organizations/:slug/storage/files',
    { schema: { params: SlugParams, querystring: StorageFilesQuerySchema, response: { 200: FilesResponse } } },
    async (request, reply) => {
      const { data, pagination } = await storage.files(request.principal!, request.params.slug, request.query);
      return reply.ok(data, { pagination });
    },
  );

  app.put(
    '/v1/organizations/:slug/storage/connection',
    { schema: { params: SlugParams, body: ConnectStorageSchema, response: { 200: ConnectionResponse } } },
    async (request, reply) =>
      reply.ok(await storage.connect(request.principal!, request.params.slug, request.body, request.ip)),
  );

  app.post(
    '/v1/organizations/:slug/storage/connection/browser-check',
    {
      schema: { params: SlugParams, body: StorageBrowserCheckInputSchema, response: { 201: BrowserCheckResponse } },
    },
    async (request, reply) =>
      reply.ok(await storage.browserCheck(request.principal!, request.params.slug, request.body), { status: 201 }),
  );

  app.post(
    '/v1/organizations/:slug/storage/connection/verify',
    { schema: { params: SlugParams, body: VerifyStorageSchema, response: { 200: ConnectionResponse } } },
    async (request, reply) =>
      reply.ok(await storage.verify(request.principal!, request.params.slug, request.body, request.ip)),
  );

  app.delete(
    '/v1/organizations/:slug/storage/connection',
    { schema: { params: SlugParams, body: DisconnectStorageSchema, response: { 200: OverviewResponse } } },
    async (request, reply) =>
      reply.ok(await storage.disconnect(request.principal!, request.params.slug, request.body, request.ip)),
  );

  app.post(
    '/v1/organizations/:slug/storage/migration',
    { schema: { params: SlugParams, response: { 202: ConnectionResponse } } },
    async (request, reply) =>
      reply.ok(await storage.startMigration(request.principal!, request.params.slug), { status: 202 }),
  );
};

export default storageRoutes;
